import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromAdminSession } from "@/lib/tenant-context";
import { getTenantPrisma } from "@/lib/tenant-prisma";

export async function GET() {
  try {
    const tenantId = await resolveTenantFromAdminSession();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const db = getTenantPrisma(tenantId);

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

      // Low stock: qty > 0 AND qty <= threshold (raw SQL for cross-column compare).
      // Raw SQL bypasses the scoped client, so the tenant filter is applied by hand.
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "Inventory"
        WHERE "tenantId" = ${tenantId}
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

    return NextResponse.json({
      stats: {
        totalOrders,
        monthRevenue: monthRevenue._sum.total ?? 0,
        activeProducts,
        lowStock: Number(lowStockRows[0]?.count ?? 0),
        monthLabel: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
      },
      recentOrders,
    });
  } catch (error) {
    console.error("GET /api/admin/dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
