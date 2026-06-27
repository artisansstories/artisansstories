import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { Prisma } from "@prisma/client";
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const where: Prisma.CustomerWhereInput = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ];
    }
    const cancelledStatuses = ["CANCELLED", "REFUNDED"];
    const voidedFinancial = ["VOIDED", "REFUNDED", "PARTIALLY_REFUNDED"];

    const [rawCustomers, total] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { totalSpent: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          lastOrderAt: true,
          createdAt: true,
          orders: {
            select: {
              total: true,
              status: true,
              financialStatus: true,
            },
          },
        },
      }),
      db.customer.count({ where }),
    ]);

    // Compute live stats per customer
    const customers = rawCustomers.map((c) => {
      const activeOrders = c.orders.filter(
        (o) => !cancelledStatuses.includes(o.status) && !voidedFinancial.includes(o.financialStatus)
      );
      return {
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        lastOrderAt: c.lastOrderAt,
        createdAt: c.createdAt,
        totalOrders: activeOrders.length,
        totalOrdersAll: c.orders.length,
        totalSpent: activeOrders.reduce((sum, o) => sum + o.total, 0),
      };
    });

    return NextResponse.json({
      customers,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/admin/customers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
