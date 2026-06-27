/**
 * stripe-connect.ts — Stripe Connect (Standard) helpers (P4)
 *
 * Each tenant onboards its OWN Standard Connect account and becomes the
 * merchant-of-record. Payments for connect tenants run through Stripe-hosted
 * Checkout (a redirect — the customer lands on Stripe's domain, which is a
 * trust feature, not a compromise). The platform collects an application fee
 * (`platformFeeBps`, basis points of the subtotal) on every charge.
 *
 * Tenant zero (Artisans Stories, `checkoutMode="embedded"`) does NOT use any of
 * this — its embedded PaymentIntent flow is untouched. Only tenants with
 * `checkoutMode="connect_redirect"` route through `createCheckoutSession`.
 *
 * The Stripe client mirrors the rest of the repo: `require("stripe")` with
 * apiVersion "2025-01-27.acacia", keyed by env STRIPE_SECRET_KEY.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require("stripe");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripe = new StripeSDK(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
}) as any;

/** Raised for any Connect precondition failure (no account, not onboarded). */
export class StripeConnectError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "StripeConnectError";
    this.code = code;
    this.status = status;
  }
}

/** Minimal shape of the Tenant fields these helpers read. */
export interface ConnectTenant {
  id: string;
  stripeConnectAccountId: string | null;
  stripeOnboarded: boolean;
  platformFeeBps: number;
  checkoutMode: string;
}

/**
 * Pure application-fee math, exported for direct unit testing.
 *
 * `application_fee_amount = floor(subtotal * bps / 10000)`, where `subtotal` is
 * in the smallest currency unit (cents) and `bps` is basis points
 * (300 bps = 3%). We FLOOR rather than round: Stripe requires an integer number
 * of cents, and flooring guarantees the fee never exceeds the intended
 * percentage (the platform never over-collects). Negative/NaN inputs clamp to 0.
 *
 * Examples:
 *   computeApplicationFee(10000, 300) === 300   // 3% of $100.00 → $3.00
 *   computeApplicationFee(2599, 250)  === 64     // 2.5% of $25.99 = 64.975 → 64
 */
export function computeApplicationFee(subtotal: number, bps: number): number {
  if (!Number.isFinite(subtotal) || !Number.isFinite(bps)) return 0;
  if (subtotal <= 0 || bps <= 0) return 0;
  return Math.floor((subtotal * bps) / 10000);
}

/**
 * Create a fresh Standard Connect account for a tenant. The platform never sees
 * the account's credentials — Standard accounts are fully Stripe-managed. We tag
 * the account with `tenantId` so connected-account webhooks can map events back.
 * Returns the new `acct_…` id (caller persists it on the tenant).
 */
export async function createConnectAccount(tenant: ConnectTenant): Promise<string> {
  const account = await stripe.accounts.create({
    type: "standard",
    metadata: { tenantId: tenant.id },
  });
  return account.id as string;
}

/**
 * Generate a Stripe-hosted onboarding (KYC) link for an existing account.
 * `refreshUrl` is where Stripe sends the user if the link expires; `returnUrl`
 * is where they land after finishing. Returns the one-time onboarding URL.
 */
export async function createAccountOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url as string;
}

/**
 * Attach an account the tenant already created in their own Stripe dashboard.
 * We validate it actually exists (and is reachable with our key) before
 * persisting, then store the id and seed `stripeOnboarded` from charges_enabled.
 * Uses the RAW client because Tenant is a platform/global model (not scoped).
 */
export async function attachExistingAccount(
  tenantId: string,
  accountId: string,
): Promise<{ accountId: string; onboarded: boolean }> {
  // Validate the account exists / is accessible. Throws if it doesn't.
  let account;
  try {
    account = await stripe.accounts.retrieve(accountId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    throw new StripeConnectError(
      "stripe_account_not_found",
      `Could not retrieve Stripe account ${accountId}: ${message}`,
      400,
    );
  }

  const onboarded = Boolean(account.charges_enabled);

  // Lazy import to avoid a circular import at module load (prisma → env).
  const { prisma } = await import("./prisma");
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { stripeConnectAccountId: accountId, stripeOnboarded: onboarded },
  });

  return { accountId, onboarded };
}

export interface CheckoutLineItem {
  /** Display name shown on the Stripe-hosted page. */
  name: string;
  /** Unit price in cents (DB-derived — never client-supplied). */
  unitAmount: number;
  quantity: number;
}

export interface CreateCheckoutSessionParams {
  tenant: ConnectTenant;
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  metadata?: Record<string, string>;
}

/**
 * Create a Stripe-hosted Checkout Session ON the tenant's connected account
 * (`{ stripeAccount }`), collecting the platform's application fee. The tenant
 * must have a connect account AND be onboarded (charges_enabled) — otherwise we
 * throw a typed `StripeConnectError` the route turns into a 409.
 *
 * Returns the created session (`{ id, url, ... }`); the caller redirects the
 * browser to `session.url`.
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams,
): Promise<{ id: string; url: string | null }> {
  const { tenant, lineItems, successUrl, cancelUrl, customerEmail, metadata } = params;

  if (!tenant.stripeConnectAccountId) {
    throw new StripeConnectError(
      "tenant_stripe_not_onboarded",
      `Tenant ${tenant.id} has no connected Stripe account`,
    );
  }
  if (!tenant.stripeOnboarded) {
    throw new StripeConnectError(
      "tenant_stripe_not_onboarded",
      `Tenant ${tenant.id} has not completed Stripe onboarding`,
    );
  }
  if (lineItems.length === 0) {
    throw new StripeConnectError("empty_line_items", "Cannot create a checkout session with no line items", 400);
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.unitAmount * li.quantity, 0);
  const applicationFeeAmount = computeApplicationFee(subtotal, tenant.platformFeeBps);

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: lineItems.map((li) => ({
        price_data: {
          currency: "usd",
          unit_amount: li.unitAmount,
          product_data: { name: li.name },
        },
        quantity: li.quantity,
      })),
      success_url: successUrl,
      cancel_url: cancelUrl,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
      },
      ...(metadata ? { metadata } : {}),
    },
    // Run the call as the connected account — the tenant is merchant-of-record.
    { stripeAccount: tenant.stripeConnectAccountId },
  );

  return { id: session.id as string, url: (session.url as string | null) ?? null };
}
