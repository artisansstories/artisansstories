import { NextRequest } from "next/server";
import { withApiKey, corsPreflight, jsonOk, SCOPE_CHECKOUT_CREATE } from "@/lib/api-v1";
import { prisma } from "@/lib/prisma";
import {
  createCheckoutSession,
  StripeConnectError,
  type ConnectTenant,
} from "@/lib/stripe-connect";

interface CheckoutItem {
  variantId: string;
  quantity: number;
  addons?: unknown;
}

/**
 * POST /api/v1/store/checkout/session
 *
 * Real Stripe Connect checkout (P4). Performs full tenant-scoped validation and
 * DB-priced amount computation (client prices are NEVER trusted), records a
 * PENDING Order, then — for `checkout_redirect` tenants — opens a Stripe-hosted
 * Checkout Session on the tenant's connected account and returns its URL.
 *
 * Contract by tenant `checkoutMode`:
 *   - "embedded"          → 409 { error:"checkout_mode_embedded" }   (tenant zero
 *                            keeps its existing embedded PaymentIntent flow; this
 *                            endpoint deliberately does NOT touch Stripe Connect)
 *   - "connect_redirect"
 *       · onboarded       → 200 { ok:true, mode:"connect_redirect", url, sessionId }
 *       · not onboarded   → 409 { ok:false, error:"tenant_stripe_not_onboarded",
 *                                  onboardingRequired:true }
 *
 * Requires scope `checkout:create`.
 */
export async function POST(req: NextRequest) {
  return withApiKey(req, SCOPE_CHECKOUT_CREATE, async ({ tenantId, db }) => {
    let body: { items?: CheckoutItem[]; successUrl?: string; cancelUrl?: string; customerEmail?: string };
    try {
      body = await req.json();
    } catch {
      return jsonOk({ error: "Invalid JSON body" }, 400);
    }

    const items = body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return jsonOk({ error: "items must be a non-empty array" }, 400);
    }
    if (!body.successUrl || !body.cancelUrl) {
      return jsonOk({ error: "successUrl and cancelUrl are required" }, 400);
    }

    const lineItems: Array<{
      variantId: string;
      productId: string;
      name: string;
      variantName: string;
      quantity: number;
      unitAmount: number;
      lineAmount: number;
    }> = [];
    let amountSubtotal = 0;

    for (const item of items) {
      if (!item || typeof item.variantId !== "string") {
        return jsonOk({ error: "each item requires a variantId" }, 400);
      }
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return jsonOk({ error: `invalid quantity for variant ${item.variantId}` }, 400);
      }

      // Scoped lookup — a variant from another tenant simply won't be found.
      const variant = await db.productVariant.findFirst({
        where: { id: item.variantId },
        include: { product: { select: { id: true, name: true, status: true, price: true } } },
      });

      if (!variant || !variant.product) {
        return jsonOk({ error: `variant not found: ${item.variantId}` }, 400);
      }
      if (variant.product.status !== "ACTIVE") {
        return jsonOk({ error: `product is not active for variant ${item.variantId}` }, 400);
      }

      // Price comes from the DB only: variant override, else product base price.
      const unitAmount = variant.price ?? variant.product.price;
      const lineAmount = unitAmount * quantity;
      amountSubtotal += lineAmount;

      lineItems.push({
        variantId: variant.id,
        productId: variant.product.id,
        name: variant.product.name,
        variantName: variant.name,
        quantity,
        unitAmount,
        lineAmount,
      });
    }

    // ── Resolve tenant payment configuration ──────────────────────────────────
    // Tenant is a platform/global model (NOT tenant-scoped), so read it raw.
    const tenant = (await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        stripeConnectAccountId: true,
        stripeOnboarded: true,
        platformFeeBps: true,
        checkoutMode: true,
      },
    })) as ConnectTenant | null;

    if (!tenant) {
      return jsonOk({ ok: false, error: "tenant_not_found" }, 404);
    }

    // Embedded tenants (e.g. Artisans Stories, tenant zero) keep their existing
    // embedded PaymentIntent flow. This endpoint is the Connect-redirect path
    // only and must NOT attempt a Connect session for them.
    if (tenant.checkoutMode !== "connect_redirect") {
      return jsonOk(
        {
          ok: false,
          mode: "embedded",
          error: "checkout_mode_embedded",
          message:
            "This tenant uses embedded checkout; use the embedded PaymentIntent flow, not the Connect redirect endpoint.",
        },
        409,
      );
    }

    // Connect-redirect tenant that hasn't finished onboarding can't take payments.
    if (!tenant.stripeConnectAccountId || !tenant.stripeOnboarded) {
      return jsonOk(
        {
          ok: false,
          error: "tenant_stripe_not_onboarded",
          onboardingRequired: true,
          message:
            "This tenant has not completed Stripe Connect onboarding. Onboard the connected account before accepting payments.",
        },
        409,
      );
    }

    // ── Record a PENDING Order BEFORE creating the session ────────────────────
    // The webhook reconciles by stripeCheckoutSessionId, so the row must exist
    // first. shippingAddress is collected on the Stripe-hosted page, so it's an
    // empty placeholder here; the webhook can enrich it from the completed
    // session later. Nested OrderItem creates bypass the scoped extension, so we
    // stamp tenantId explicitly (per P2 convention).
    const orderNumber = `AS-${Date.now()}`;
    const order = await db.order.create({
      data: {
        tenantId,
        orderNumber,
        email: body.customerEmail ?? "",
        shippingAddress: {} as object,
        subtotal: amountSubtotal,
        total: amountSubtotal,
        currency: "usd",
        status: "PENDING",
        financialStatus: "PENDING",
        items: {
          create: lineItems.map((li) => ({
            tenantId,
            productId: li.productId,
            variantId: li.variantId,
            title: li.name,
            variantTitle: li.variantName,
            quantity: li.quantity,
            price: li.unitAmount,
            total: li.lineAmount,
            productSnapshot: {
              name: li.name,
              variantName: li.variantName,
              price: li.unitAmount,
            } as object,
          })),
        },
      } as never,
    });

    // ── Open the Stripe-hosted Checkout Session on the connected account ──────
    try {
      const session = await createCheckoutSession({
        tenant,
        lineItems: lineItems.map((li) => ({
          name: li.variantName && li.variantName !== li.name ? `${li.name} — ${li.variantName}` : li.name,
          unitAmount: li.unitAmount,
          quantity: li.quantity,
        })),
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
        customerEmail: body.customerEmail ?? null,
        metadata: { tenantId, orderId: order.id, orderNumber },
      });

      // Store the session id so the webhook can reconcile this Order.
      await db.order.update({
        where: { id: order.id },
        data: { stripeCheckoutSessionId: session.id },
      });

      return jsonOk({
        ok: true,
        mode: "connect_redirect",
        url: session.url,
        sessionId: session.id,
        orderId: order.id,
        orderNumber,
        amountSubtotal,
        currency: "usd",
      });
    } catch (err) {
      // A typed Connect precondition error maps to 409; anything else bubbles
      // up to the withApiKey 500 handler. Either way, the PENDING order remains
      // and is simply never reconciled (no payment was taken).
      if (err instanceof StripeConnectError) {
        return jsonOk(
          {
            ok: false,
            error: err.code,
            onboardingRequired: err.code === "tenant_stripe_not_onboarded",
            message: err.message,
          },
          err.status,
        );
      }
      throw err;
    }
  });
}

export function OPTIONS() {
  return corsPreflight();
}
