import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-auth";
import { stripe } from "@/lib/stripe-connect";

/**
 * GET /api/platform/tenants/[id]/stripe-status
 *
 * Platform-admin route. Retrieves the tenant's connected account from Stripe and
 * reports its capability flags. Side effect: syncs `tenant.stripeOnboarded` to
 * the account's `charges_enabled` so the checkout path reflects reality.
 *
 * AUTH: same POC rule as the connect route — valid admin session belonging to a
 * platform-owner tenant.
 *
 * Returns: { chargesEnabled, payoutsEnabled, detailsSubmitted, onboarded }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
      { error: "forbidden", message: "Stripe status is restricted to platform-owner admins." },
      { status: 403 },
    );
  }

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, stripeConnectAccountId: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }
  if (!tenant.stripeConnectAccountId) {
    return NextResponse.json(
      {
        error: "no_connected_account",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        onboarded: false,
      },
      { status: 409 },
    );
  }

  try {
    const account = await stripe.accounts.retrieve(tenant.stripeConnectAccountId);
    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const detailsSubmitted = Boolean(account.details_submitted);

    // Keep the tenant's onboarding flag in sync with the source of truth.
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeOnboarded: chargesEnabled },
    });

    return NextResponse.json({
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      onboarded: chargesEnabled,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[platform/stripe-status] error", err);
    return NextResponse.json({ error: "stripe_status_failed", message }, { status: 502 });
  }
}
