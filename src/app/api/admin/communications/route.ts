import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Unified communications feed.
 * Returns a merged, time-sorted list of:
 *   - ContactMessage entries (with replies inline) — type "conversation"
 *   - EmailLog entries — type "email"
 *
 * Query params:
 *   filter: ALL | CONVERSATIONS | TRANSACTIONAL | UNREAD
 *   page: number (default 1)
 *   limit: number (default 20)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const filter = (sp.get("filter") ?? "ALL").toUpperCase();
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") ?? "20", 10)));
    const skip = (page - 1) * limit;

    const includeConversations = filter === "ALL" || filter === "CONVERSATIONS" || filter === "UNREAD";
    const includeTransactional = filter === "ALL" || filter === "TRANSACTIONAL";

    // Fetch conversations (contact messages with replies)
    const convWhere: Prisma.ContactMessageWhereInput =
      filter === "UNREAD" ? { status: "UNREAD" } : {};

    const [conversations, convTotal, unreadCount, emailLogs, emailTotal] = await Promise.all([
      includeConversations
        ? prisma.contactMessage.findMany({
            where: convWhere,
            orderBy: { createdAt: "desc" },
            include: { replies: { orderBy: { createdAt: "asc" } } },
          })
        : Promise.resolve([]),

      includeConversations
        ? prisma.contactMessage.count({ where: convWhere })
        : Promise.resolve(0),

      prisma.contactMessage.count({ where: { status: "UNREAD" } }),

      includeTransactional
        ? prisma.emailLog.findMany({
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),

      includeTransactional
        ? prisma.emailLog.count()
        : Promise.resolve(0),
    ]);

    // Merge into unified feed
    type FeedItem =
      | { kind: "conversation"; createdAt: Date; data: (typeof conversations)[0] }
      | { kind: "email"; createdAt: Date; data: (typeof emailLogs)[0] };

    const feed: FeedItem[] = [
      ...conversations.map((c) => ({ kind: "conversation" as const, createdAt: c.createdAt, data: c })),
      ...emailLogs.map((e) => ({ kind: "email" as const, createdAt: e.createdAt, data: e })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = convTotal + emailTotal;
    const paginated = feed.slice(skip, skip + limit);

    return NextResponse.json({
      items: paginated,
      total,
      pages: Math.ceil(total / limit),
      unreadCount,
    });
  } catch (error) {
    console.error("GET /api/admin/communications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
