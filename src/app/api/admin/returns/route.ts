import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReturnStatus, Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

    const where: Prisma.ReturnWhereInput = {};

    if (status && Object.values(ReturnStatus).includes(status as ReturnStatus)) {
      where.status = status as ReturnStatus;
    }

    const [total, returns] = await Promise.all([
      prisma.return.count({ where }),
      prisma.return.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { requestedAt: "desc" },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              email: true,
              total: true,
              customer: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          items: {
            include: {
              orderItem: { select: { title: true, variantTitle: true } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({ returns, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("GET /api/admin/returns error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
