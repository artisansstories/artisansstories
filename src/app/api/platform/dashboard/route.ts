import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import { getPlatformOrderStats } from "@/lib/platform-tenant-stats";

/**
 * /api/platform/dashboard — operator dashboard roll-up (A6 / P1-4)
 *
 * One server-side aggregate so the dashboard isn't computed client-side from the
 * full tenant list. Covers all NON-archived tenants:
 *   - counts: tenants, active, Stripe-onboarded, total products
 *   - revenue: total paid revenue (CENTS) + total orders across those tenants
 *   - needsAttention: ACTIVE tenants that have products but aren't live yet
 *     (storeEnabled=false) — the "needs go-live" list
 *   - recent: the 5 most recent onboards (with storeEnabled + productCount)
 *
 * AUTH: requirePlatformOperator — operator `as-platform-session` cookie.
 * Aggregates are cross-tenant operator reads on the RAW prisma client.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  // Non-archived tenants are the operative universe for the dashboard.
  const tenants = await prisma.tenant.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      stripeOnboarded: true,
      createdAt: true,
    },
  });
  const tenantIds = tenants.map((t) => t.id);

  // Per-tenant product counts (one grouped query) and storeEnabled flags (one
  // findMany) — no per-tenant fan-out.
  const [productGroups, settings, orderStats] = await Promise.all([
    prisma.product.groupBy({ by: ["tenantId"], _count: { _all: true } }),
    prisma.storeSettings.findMany({ select: { tenantId: true, storeEnabled: true } }),
    getPlatformOrderStats(tenantIds),
  ]);
  const productCountByTenant = new Map(productGroups.map((g) => [g.tenantId, g._count._all]));
  const enabledByTenant = new Map(settings.map((s) => [s.tenantId, s.storeEnabled]));

  const totalProducts = tenants.reduce(
    (sum, t) => sum + (productCountByTenant.get(t.id) ?? 0),
    0,
  );
  const activeCount = tenants.filter((t) => t.status === "ACTIVE").length;
  const onboardedCount = tenants.filter((t) => t.stripeOnboarded).length;

  // "Needs go-live": an ACTIVE tenant with products but the storefront still
  // switched off — built but not launched. Capped so the card stays bounded.
  const needsAttention = tenants
    .filter(
      (t) =>
        t.status === "ACTIVE" &&
        (productCountByTenant.get(t.id) ?? 0) > 0 &&
        !(enabledByTenant.get(t.id) ?? false),
    )
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      productCount: productCountByTenant.get(t.id) ?? 0,
    }));

  const recent = tenants.slice(0, 5).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    stripeOnboarded: t.stripeOnboarded,
    storeEnabled: enabledByTenant.get(t.id) ?? false,
    productCount: productCountByTenant.get(t.id) ?? 0,
    createdAt: t.createdAt,
  }));

  return NextResponse.json({
    counts: {
      tenants: tenants.length,
      active: activeCount,
      stripeOnboarded: onboardedCount,
      totalProducts,
    },
    revenue: {
      totalPaidRevenueCents: orderStats.totalPaidRevenueCents,
      totalOrders: orderStats.totalOrders,
      paidOrders: orderStats.paidOrders,
    },
    needsAttention,
    recent,
  });
}
