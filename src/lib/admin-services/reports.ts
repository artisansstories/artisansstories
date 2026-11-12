/**
 * admin-services/reports.ts — report logic shared by /api/admin/reports/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). Only the
 * sales report takes a date range; its default (last 30 days, ending today,
 * server-local time) is explicit and shared by the route and MCP.
 */
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, type ServiceResult } from "./result";

// ── sales ───────────────────────────────────────────────────────────────────

export interface SalesReportParams {
  /** YYYY-MM-DD; falsy → 29 days before today (30-day window incl. today). */
  startDate?: string | null;
  /** YYYY-MM-DD (inclusive); falsy → end of today. */
  endDate?: string | null;
}

export async function salesReport(db: TenantPrisma, p: SalesReportParams): Promise<ServiceResult<unknown>> {
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setHours(23, 59, 59, 999);
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - 29);
  defaultStart.setHours(0, 0, 0, 0);
  const startDate = p.startDate
    ? new Date(p.startDate)
    : defaultStart;
  const endDate = p.endDate
    ? (() => { const d = new Date(p.endDate!); d.setHours(23, 59, 59, 999); return d; })()
    : defaultEnd;
  // Calculate previous period of same length
  const periodMs = endDate.getTime() - startDate.getTime();
  const prevEnd = new Date(startDate.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - periodMs);
  const [orders, prevOrders] = await Promise.all([
    db.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        financialStatus: "PAID",
      },
      select: { total: true, createdAt: true },
    }),
    db.order.findMany({
      where: {
        createdAt: { gte: prevStart, lte: prevEnd },
        financialStatus: "PAID",
      },
      select: { total: true },
    }),
  ]);
  // Group by day
  const byDay: Record<string, { revenue: number; orders: number }> = {};
  for (const order of orders) {
    const day = order.createdAt.toISOString().split("T")[0];
    if (!byDay[day]) byDay[day] = { revenue: 0, orders: 0 };
    byDay[day].revenue += order.total;
    byDay[day].orders += 1;
  }
  // Fill all days in range
  const dailyRevenue: Array<{ date: string; revenue: number; orders: number }> = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= endDate) {
    const key = cursor.toISOString().split("T")[0];
    dailyRevenue.push({
      date: key,
      revenue: byDay[key]?.revenue ?? 0,
      orders: byDay[key]?.orders ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const prevRevenue = prevOrders.reduce((s, o) => s + o.total, 0);
  const prevOrderCount = prevOrders.length;
  const revenueChange =
    prevRevenue === 0
      ? totalRevenue > 0 ? 100 : 0
      : Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100);
  const ordersChange =
    prevOrderCount === 0
      ? totalOrders > 0 ? 100 : 0
      : Math.round(((totalOrders - prevOrderCount) / prevOrderCount) * 100);
  return ok({
    dailyRevenue,
    totalRevenue,
    totalOrders,
    avgOrderValue,
    revenueChange,
    ordersChange,
  });
}

// ── products ────────────────────────────────────────────────────────────────

export async function productsReport(db: TenantPrisma): Promise<ServiceResult<unknown>> {
  // Aggregate order items by product
  const orderItems = await db.orderItem.findMany({
    where: { productId: { not: null } },
    select: {
      productId: true,
      title: true,
      quantity: true,
      total: true,
      product: {
        select: {
          id: true,
          name: true,
          images: { select: { url: true }, orderBy: { position: "asc" }, take: 1 },
        },
      },
    },
  });
  // Aggregate by productId
  const byProduct: Record<
    string,
    { productId: string; productName: string; revenue: number; unitsSold: number; imageUrl?: string }
  > = {};
  for (const item of orderItems) {
    const pid = item.productId!;
    if (!byProduct[pid]) {
      byProduct[pid] = {
        productId: pid,
        productName: item.product?.name ?? item.title,
        revenue: 0,
        unitsSold: 0,
        imageUrl: item.product?.images?.[0]?.url,
      };
    }
    byProduct[pid].revenue += item.total;
    byProduct[pid].unitsSold += item.quantity;
  }
  const allProducts = Object.values(byProduct);
  const topByRevenue = [...allProducts]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  const topByUnits = [...allProducts]
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10);
  // Low stock: fetch all tracked inventory and filter in JS (Prisma can't compare two fields)
  const allInventory = await db.inventory.findMany({
    where: { trackedInventory: true },
    include: {
      variant: {
        select: {
          id: true,
          name: true,
          sku: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  const lowStock = allInventory
    .filter((inv) => inv.quantity <= inv.lowStockThreshold)
    .map((inv) => ({
      variantId: inv.variantId,
      productName: inv.variant.product.name,
      variantName: inv.variant.name,
      quantity: inv.quantity,
      threshold: inv.lowStockThreshold,
      sku: inv.variant.sku ?? undefined,
    }));
  return ok({ topByRevenue, topByUnits, lowStock });
}

// ── customers ───────────────────────────────────────────────────────────────

export async function customersReport(db: TenantPrisma): Promise<ServiceResult<unknown>> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalCustomers, allCustomers] = await Promise.all([
    db.customer.count(),
    db.customer.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        totalSpent: true,
        totalOrders: true,
        lastOrderAt: true,
        createdAt: true,
      },
      orderBy: { totalSpent: "desc" },
    }),
  ]);
  const newThisMonth = allCustomers.filter(
    (c) => new Date(c.createdAt) >= startOfMonth
  ).length;
  // Returning = placed an order this month but NOT new this month
  const returningThisMonth = allCustomers.filter(
    (c) =>
      c.lastOrderAt &&
      new Date(c.lastOrderAt) >= startOfMonth &&
      new Date(c.createdAt) < startOfMonth
  ).length;
  const topByLifetimeValue = allCustomers.slice(0, 10).map((c) => ({
    customerId: c.id,
    email: c.email,
    firstName: c.firstName ?? undefined,
    lastName: c.lastName ?? undefined,
    totalSpent: c.totalSpent,
    totalOrders: c.totalOrders,
    lastOrderAt: c.lastOrderAt?.toISOString() ?? undefined,
  }));
  return ok({
    totalCustomers,
    newThisMonth,
    returningThisMonth,
    topByLifetimeValue,
  });
}

// ── discounts ───────────────────────────────────────────────────────────────

export async function discountsReport(db: TenantPrisma): Promise<ServiceResult<unknown>> {
  const discounts = await db.discount.findMany({
    orderBy: { usageCount: "desc" },
  });
  // For each discount, compute total revenue from orders using that code
  const discountCodes = discounts.map((d) => d.code);
  const ordersByCode = await db.order.groupBy({
    by: ["discountCode"],
    where: { discountCode: { in: discountCodes }, financialStatus: "PAID" },
    _sum: { total: true },
  });
  const revenueByCode: Record<string, number> = {};
  for (const row of ordersByCode) {
    if (row.discountCode) {
      revenueByCode[row.discountCode] = row._sum.total ?? 0;
    }
  }
  const result = discounts.map((d) => ({
    id: d.id,
    code: d.code,
    type: d.type,
    value: d.value,
    usageCount: d.usageCount,
    totalRevenue: revenueByCode[d.code] ?? 0,
    isActive: d.isActive,
  }));
  return ok({ discounts: result });
}
