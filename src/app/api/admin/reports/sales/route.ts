import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest) {
  try {
    
    
    const searchParams = request.nextUrl.searchParams;
    const now = new Date();
    const defaultEnd = new Date(now);
    defaultEnd.setHours(23, 59, 59, 999);
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 29);
    defaultStart.setHours(0, 0, 0, 0);
    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : defaultStart;
    const endDate = searchParams.get("endDate")
      ? (() => { const d = new Date(searchParams.get("endDate")!); d.setHours(23, 59, 59, 999); return d; })()
      : defaultEnd;
    // Calculate previous period of same length
    const periodMs = endDate.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);
    const [orders, prevOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          financialStatus: "PAID",
        },
        select: { total: true, createdAt: true },
      }),
      prisma.order.findMany({
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
    return NextResponse.json({
      dailyRevenue,
      totalRevenue,
      totalOrders,
      avgOrderValue,
      revenueChange,
      ordersChange,
    });
  } catch (err) {
    console.error("GET /api/admin/reports/sales error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
