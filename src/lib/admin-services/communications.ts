/**
 * admin-services/communications.ts — unified communications feed and email log,
 * shared by /api/admin/communications, /api/admin/email-log/[id] and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). All reads go
 * through the tenant-scoped client. `summarizeFeedItems` is MCP-only: it drops
 * the (potentially large) HTML bodies from list results.
 */
import { Prisma } from "@prisma/client";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, fail } from "./result";

export interface CommunicationsParams {
  /** ALL | CONVERSATIONS | TRANSACTIONAL | UNREAD (case-insensitive) */
  filter?: string;
  page?: number;
  limit?: number;
}

export async function listCommunications(db: TenantPrisma, p: CommunicationsParams) {
  const filter = (p.filter ?? "ALL").toUpperCase();
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(50, Math.max(1, p.limit ?? 20));
  const skip = (page - 1) * limit;

  const includeConversations = filter === "ALL" || filter === "CONVERSATIONS" || filter === "UNREAD";
  const includeTransactional = filter === "ALL" || filter === "TRANSACTIONAL";

  // Fetch conversations (contact messages with replies)
  const convWhere: Prisma.ContactMessageWhereInput =
    filter === "UNREAD" ? { status: "UNREAD" } : {};

  const [conversations, convTotal, unreadCount, emailLogs, emailTotal] = await Promise.all([
    includeConversations
      ? db.contactMessage.findMany({
          where: convWhere,
          orderBy: { createdAt: "desc" },
          include: { replies: { orderBy: { createdAt: "asc" } } },
        })
      : Promise.resolve([]),

    includeConversations
      ? db.contactMessage.count({ where: convWhere })
      : Promise.resolve(0),

    db.contactMessage.count({ where: { status: "UNREAD" } }),

    // Exclude CONTACT_INBOUND and CONTACT_REPLY from email log —
    // those are already represented as ContactMessage conversation threads.
    includeTransactional
      ? db.emailLog.findMany({
          where: { type: { notIn: ["CONTACT_INBOUND", "CONTACT_REPLY"] } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),

    includeTransactional
      ? db.emailLog.count({ where: { type: { notIn: ["CONTACT_INBOUND", "CONTACT_REPLY"] } } })
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

  return ok({
    items: paginated,
    total,
    pages: Math.ceil(total / limit),
    unreadCount,
  });
}

type FeedItems = Extract<Awaited<ReturnType<typeof listCommunications>>, { ok: true }>["data"]["items"];

const snippet = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** MCP list view: no HTML bodies, message text truncated, reply bodies dropped. */
export function summarizeFeedItems(items: FeedItems) {
  return items.map((item) => {
    if (item.kind === "email") {
      const { bodyHtml, ...rest } = item.data;
      return { kind: item.kind, createdAt: item.createdAt, email: { ...rest, hasBody: !!bodyHtml } };
    }
    const { message, replies, ...rest } = item.data;
    return {
      kind: item.kind,
      createdAt: item.createdAt,
      conversation: {
        ...rest,
        messageSnippet: snippet(message),
        replyCount: replies.length,
        lastReplyAt: replies.length ? replies[replies.length - 1].createdAt : null,
      },
    };
  });
}

export async function getEmailLog(db: TenantPrisma, id: string) {
  const log = await db.emailLog.findUnique({ where: { id } });
  if (!log) {
    return fail(404, "Email log not found");
  }
  return ok({ log });
}
