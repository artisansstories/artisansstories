import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus, FinancialStatus, Prisma } from "@prisma/client";
export async function GET(request: NextRequest) {
  try {
    
    
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") ?? "";
    const financialStatus = searchParams.get("financialStatus") ?? "";
    const search = searchParams.get("search") ?? "";
    const startDate = searchParams.get("startDate") ?? "";
    const endDate = searchParams.get("endDate") ?? "";
    const exportCsv = searchParams.get("export") === "csv";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const where: Prisma.OrderWhereInput = {};
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status && Object.values(OrderStatus).includes(status as OrderStatus)) {
      where.status = status as OrderStatus;
    }
    if (financialStatus && Object.values(FinancialStatus).includes(financialStatus as FinancialStatus)) {
      where.financialStatus = financialStatus as FinancialStatus;
    }
    if (startDate) {
      where.createdAt = { ...((where.createdAt as object) ?? {}), gte: new Date(startDate) };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { ...((where.createdAt as object) ?? {}), lte: end };
    }
    if (exportCsv) {
      const orders = await prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
      });
      const rows = [
        ["Order #", "Date", "Email", "Status", "Financial Status", "Total", "Items"],
        ...orders.map((o) => [
          o.orderNumber,
          new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(o.createdAt)),
          o.email,
          o.status,
          o.financialStatus,
          `$${(o.total / 100).toFixed(2)}`,
          String(o._count.items),
        ]),
      ];
      const csvContent = rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      return new Response(csvContent, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="orders.csv"',
        },
      });
    }
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);
    const ordersOut = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      financialStatus: o.financialStatus,
      email: o.email,
      phone: o.phone,
      total: o.total,
      currency: o.currency,
      itemsCount: o._count.items,
      customer: o.customer,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));
    return NextResponse.json({ orders: ordersOut, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("GET /api/admin/orders error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
