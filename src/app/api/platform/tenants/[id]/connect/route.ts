import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import {
  createConnectAccount,
  createAccountOnboardingLink,
  attachExistingAccount,
  StripeConnectError,
  type ConnectTenant,
} from "@/lib/stripe-connect";

/**
 * POST /api/platform/tenants/[id]/connect
 *
 * Platform-admin route to onboard a tenant onto Stripe Connect (Standard).
 *
 * Body:
 *   { existingAccountId?: string, refreshUrl?: string, returnUrl?: string }
 *
 *   - existingAccountId present → validate + attach it to the tenant, returning
 *     { attached:true, onboarded }.
 *   - otherwise → create a fresh Standard account, persist its id on the tenant,
 *     mint an onboarding link, and return { url } for the tenant to complete KYC.
 *
 * AUTH (P10): operator-only via `requirePlatformOperator` (the `as-platform-session`
 * cookie). Onboarding a tenant onto Stripe is a platform-operator action; it no
 * longer reads `isPlatformOwner` or any store-admin session.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id: tenantId } = await params;

  let body: { existingAccountId?: string; refreshUrl?: string; returnUrl?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

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
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  try {
    // ── Attach an account the tenant created themselves ────────────────────
    if (body.existingAccountId) {
      const result = await attachExistingAccount(tenantId, body.existingAccountId);
      return NextResponse.json({ attached: true, accountId: result.accountId, onboarded: result.onboarded });
    }

    // ── Otherwise create a new account + onboarding link ───────────────────
    // Reuse an existing account id if one is already stored (idempotent-ish).
    const accountId = tenant.stripeConnectAccountId ?? (await createConnectAccount(tenant));
    if (!tenant.stripeConnectAccountId) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { stripeConnectAccountId: accountId },
      });
    }

    const origin = req.nextUrl.origin;
    const refreshUrl = body.refreshUrl ?? `${origin}/platform/tenants/${tenantId}/connect/refresh`;
    const returnUrl = body.returnUrl ?? `${origin}/platform/tenants/${tenantId}/connect/return`;

    const url = await createAccountOnboardingLink(accountId, refreshUrl, returnUrl);
    return NextResponse.json({ accountId, url });
  } catch (err) {
    if (err instanceof StripeConnectError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[platform/connect] error", err);
    return NextResponse.json({ error: "stripe_connect_failed", message }, { status: 500 });
  }
}
