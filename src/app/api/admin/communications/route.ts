import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const tab = sp.get("tab") ?? "conversations"; // conversations | log
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const limit = 20;
    const status = sp.get("status");
    const type = sp.get("type");

    if (tab === "conversations") {
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
      return NextResponse.json({ tab: "conversations", messages, total, pages: Math.ceil(total / limit), unreadCount });
    }

    // Email log tab
    const logWhere: Prisma.EmailLogWhereInput = {};
    if (type && type !== "ALL") {
      logWhere.type = type as Prisma.EnumEmailLogTypeFilter["equals"];
    }
    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where: logWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailLog.count({ where: logWhere }),
    ]);
    return NextResponse.json({ tab: "log", logs, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("GET /api/admin/communications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
