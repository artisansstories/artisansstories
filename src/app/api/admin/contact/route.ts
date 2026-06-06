import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const status = searchParams.get("status");

    const where: Prisma.ContactMessageWhereInput = {};
    if (status && status !== "ALL") {
      where.status = status as Prisma.EnumContactMessageStatusFilter["equals"];
    }

    const [messages, total, unreadCount] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { replies: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.contactMessage.count({ where }),
      prisma.contactMessage.count({ where: { status: "UNREAD" } }),
    ]);

    return NextResponse.json({
      messages,
      total,
      pages: Math.ceil(total / limit),
      unreadCount,
    });
  } catch (error) {
    console.error("GET /api/admin/contact error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
