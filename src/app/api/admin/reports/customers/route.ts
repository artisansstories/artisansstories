import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() {
  try {
    
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [totalCustomers, allCustomers] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.findMany({
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
    return NextResponse.json({
      totalCustomers,
      newThisMonth,
      returningThisMonth,
      topByLifetimeValue,
    });
  } catch (err) {
    console.error("GET /api/admin/reports/customers error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
