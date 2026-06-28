/**
 * platform-tenant-stats.ts — operator-facing tenant ops aggregates (A6 / P1-3, P1-4)
 *
 * Cross-tenant operator reads: these aggregate a single tenant's (or the whole
 * platform's) orders/customers/revenue. They use the RAW `prisma` client with an
 * explicit `where: { tenantId }` — NOT the request-scoped tenant client — because
 * the operator console reads across tenants by design.
 *
 * Revenue is summed only over orders whose `financialStatus` means money was
 * actually captured (PAID_FINANCIAL_STATUSES). PENDING / AUTHORIZED / VOIDED
 * never captured funds, so they never count toward revenue (and a store with only
 * those is still hard-deletable — see the DELETE gate, which reuses this set).
 * Totals are in CENTS (Order.total is an Int of cents); format at the edge.
 */
import { prisma } from "./prisma";

/**
 * `Order.financialStatus` values that mean the store actually captured money.
 * Single source of truth: the tenant-detail revenue figure AND the hard-delete
 * "archive-only if it ever took money" gate both read this.
 */
export const PAID_FINANCIAL_STATUSES = [
  "PAID",
  "PARTIALLY_PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;

export interface TenantStats {
  /** All orders for the tenant, regardless of financial status. */
  ordersCount: number;
  /** Orders that captured money (financialStatus ∈ PAID_FINANCIAL_STATUSES). */
  paidOrdersCount: number;
  /** Sum of `total` (CENTS) over paid orders only. */
  paidRevenueCents: number;
  /** Customer rows for the tenant. */
  customersCount: number;
}

/**
 * Per-tenant ops stats for the detail Overview card. One grouped aggregate +
 * two counts; no per-row fan-out.
 */
export async function getTenantStats(tenantId: string): Promise<TenantStats> {
  const [ordersCount, paidAgg, customersCount] = await Promise.all([
    prisma.order.count({ where: { tenantId } }),
    prisma.order.aggregate({
      where: { tenantId, financialStatus: { in: [...PAID_FINANCIAL_STATUSES] } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.customer.count({ where: { tenantId } }),
  ]);

  return {
    ordersCount,
    paidOrdersCount: paidAgg._count._all,
    paidRevenueCents: paidAgg._sum.total ?? 0,
    customersCount,
  };
}

/** Platform-wide paid revenue + order totals across a bounded set of tenants. */
export async function getPlatformOrderStats(
  tenantIds: string[],
): Promise<{ totalOrders: number; totalPaidRevenueCents: number; paidOrders: number }> {
  if (tenantIds.length === 0) {
    return { totalOrders: 0, totalPaidRevenueCents: 0, paidOrders: 0 };
  }
  const [totalOrders, paidAgg] = await Promise.all([
    prisma.order.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.order.aggregate({
      where: { tenantId: { in: tenantIds }, financialStatus: { in: [...PAID_FINANCIAL_STATUSES] } },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);
  return {
    totalOrders,
    totalPaidRevenueCents: paidAgg._sum.total ?? 0,
    paidOrders: paidAgg._count._all,
  };
}

/** Format a CENTS integer as USD, e.g. 123456 → "$1,234.56". */
export function formatCentsUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100,
  );
}
