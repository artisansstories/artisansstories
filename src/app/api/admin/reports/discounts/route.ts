import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() {
  try {
    
    
    const discounts = await prisma.discount.findMany({
      orderBy: { usageCount: "desc" },
    });
    // For each discount, compute total revenue from orders using that code
    const discountCodes = discounts.map((d) => d.code);
    const ordersByCode = await prisma.order.groupBy({
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
    return NextResponse.json({ discounts: result });
  } catch (err) {
    console.error("GET /api/admin/reports/discounts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
