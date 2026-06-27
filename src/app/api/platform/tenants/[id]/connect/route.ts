import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-auth";
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
 * AUTH (POC decision): we require a VALID admin session AND that the admin
 * belongs to the platform-owner tenant (`isPlatformOwner = true`). This keeps
 * onboarding a platform-operator action rather than something any tenant admin
 * can do to an arbitrary tenant id. If the session predates P2 and carries no
 * tenantId, we resolve it from the AdminUser row. Tighten to a dedicated
 * platform-operator role post-POC.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Resolve the admin's tenant and require it to be the platform owner.
  let adminTenantId = (session as { tenantId?: string }).tenantId;
  if (!adminTenantId) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: session.id },
      select: { tenantId: true },
    });
    adminTenantId = admin?.tenantId ?? undefined;
  }
  const ownerTenant = adminTenantId
    ? await prisma.tenant.findUnique({
        where: { id: adminTenantId },
        select: { isPlatformOwner: true },
      })
    : null;
  if (!ownerTenant?.isPlatformOwner) {
    return NextResponse.json(
      { error: "forbidden", message: "Stripe Connect onboarding is restricted to platform-owner admins." },
      { status: 403 },
    );
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
