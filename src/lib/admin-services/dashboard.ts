/**
 * admin-services/dashboard.ts — dashboard summary shared by /api/admin/dashboard and MCP.
 *
 * Extracted verbatim from the route handler (behavior unchanged).
 */
import { prisma } from "@/lib/prisma";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, type ServiceResult } from "./result";

export async function getDashboard(db: TenantPrisma): Promise<ServiceResult<unknown>> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [
    totalOrders,
    monthRevenue,
    activeProducts,
    lowStockRows,
    recentOrders,
  ] = await Promise.all([
    // All-time order count
    db.order.count(),

    // This month's revenue (paid orders only)
    db.order.aggregate({
      where: {
        financialStatus: { in: ["PAID", "PARTIALLY_PAID"] },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      _sum: { total: true },
    }),

    // Active (published) product count
    db.product.count({ where: { status: "ACTIVE" } }),

    // Low stock: qty > 0 AND qty <= threshold. Raw SQL is REQUIRED here because
    // Prisma's query API can't express a column-to-column compare (quantity <=
    // "lowStockThreshold"). Raw bypasses the scoped client, so the tenant filter
    // is applied by hand — sourced from db.$tenantId so it matches the scoped client.
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "Inventory"
      WHERE "tenantId" = ${db.$tenantId}
        AND "trackedInventory" = true
        AND quantity > 0
        AND quantity <= "lowStockThreshold"
    `,

    // Recent 5 orders
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        financialStatus: true,
        total: true,
        email: true,
        createdAt: true,
        customer: { select: { firstName: true, lastName: true } },
        items: {
          take: 1,
          select: {
            variant: {
              select: {
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  return ok({
    stats: {
      totalOrders,
      monthRevenue: monthRevenue._sum.total ?? 0,
      activeProducts,
      lowStock: Number(lowStockRows[0]?.count ?? 0),
      monthLabel: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
    },
    recentOrders,
  });
}
