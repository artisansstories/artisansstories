/**
 * admin-services/contact.ts — contact inbox logic shared by /api/admin/contact/*
 * and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged), plus a
 * read-only single-message getter (MCP only — the admin UI reads via the list)
 * and `preview*` helpers. The reply email is built by `buildContactReplyEmail`,
 * used by both preview and send, so the preview is exactly what gets emailed.
 */
import { Resend } from "resend";
import { Prisma, type ContactMessage } from "@prisma/client";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { getEmailBranding, emailLogoHtml, type EmailBranding } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
import { ok, fail } from "./result";

const resend = new Resend(process.env.RESEND_API_KEY);

export type ContactStatus = "UNREAD" | "READ" | "REPLIED" | "ARCHIVED";

// ── list / get ──────────────────────────────────────────────────────────────

export interface ContactListParams {
  page?: number;
  limit?: number;
  status?: string | null;
}

export async function listContactMessages(db: TenantPrisma, p: ContactListParams) {
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(100, Math.max(1, p.limit ?? 20));
  const status = p.status;

  const where: Prisma.ContactMessageWhereInput = {};
  if (status && status !== "ALL") {
    where.status = status as Prisma.EnumContactMessageStatusFilter["equals"];
  }

  const [messages, total, unreadCount] = await Promise.all([
    db.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { replies: { orderBy: { createdAt: "asc" } } },
    }),
    db.contactMessage.count({ where }),
    db.contactMessage.count({ where: { status: "UNREAD" } }),
  ]);

  return ok({
    messages,
    total,
    pages: Math.ceil(total / limit),
    unreadCount,
  });
}

/** MCP only (no matching route): one message with its reply thread. */
export async function getContactMessage(db: TenantPrisma, id: string) {
  const message = await db.contactMessage.findUnique({
    where: { id },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  if (!message) return fail(404, "Message not found");
  return ok({ message });
}

// ── update (status / notes) ─────────────────────────────────────────────────

export interface ContactUpdateBody {
  status?: string;
  notes?: string;
}

export async function updateContactMessage(db: TenantPrisma, id: string, body: ContactUpdateBody) {
  const message = await db.contactMessage.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: body.status as ContactStatus }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  });

  return ok({ message });
}

export async function previewUpdateContactMessage(db: TenantPrisma, id: string, body: ContactUpdateBody) {
  const cur = await db.contactMessage.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, subject: true, status: true, notes: true },
  });
  if (!cur) return fail(404, "Message not found");
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  if (body.status !== undefined && body.status !== cur.status) changes.status = { before: cur.status, after: body.status };
  if (body.notes !== undefined && body.notes !== cur.notes) changes.notes = { before: cur.notes, after: body.notes };
  return ok({
    message: { id: cur.id, from: `${cur.name} <${cur.email}>`, subject: cur.subject },
    changes,
    emailsSent: [],
    note: Object.keys(changes).length ? "Internal fields only; the sender is not notified." : "No changes.",
  });
}

// ── reply ───────────────────────────────────────────────────────────────────

/** The exact email the reply route sends. */
export function buildContactReplyEmail(branding: EmailBranding, contactMsg: ContactMessage, replyText: string) {
  const text = replyText.trim();
  return {
    from: branding.from,
    to: [contactMsg.email],
    replyTo: branding.replyTo ?? branding.fromAddress,
    subject: `Re: ${contactMsg.subject}`,
    html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
          <div style="padding:28px 32px;text-align:center;border-bottom:1px solid #ede8df;">
            ${emailLogoHtml(branding)}
          </div>
          <div style="padding:32px 40px;">
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;color:#3a2e24;margin:0 0 16px;">Hi ${contactMsg.name},</p>
            <div style="font-size:15px;color:#3a2e24;line-height:1.7;white-space:pre-wrap;margin:0 0 24px;">${text}</div>
            <div style="border-top:1px solid #ede8df;padding-top:20px;">
              <p style="font-size:13px;color:#9a876e;margin:0 0 4px;">Warmly,</p>
              <p style="font-size:14px;font-weight:600;color:#3a2e24;margin:0;">${branding.storeName}</p>
            </div>
          </div>
          <div style="padding:16px 40px;background:#3a2e24;text-align:center;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.4);">&copy; ${new Date().getFullYear()} ${branding.storeName}. All rights reserved.</p>
          </div>
        </div>
        <div style="margin-top:24px;padding:16px 20px;background:#f5f5f5;border-radius:8px;font-family:Inter,sans-serif;border-left:3px solid #d8cfc0;">
          <p style="font-size:11px;color:#999;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Original message from ${contactMsg.name}</p>
          <p style="font-size:13px;color:#666;line-height:1.6;white-space:pre-wrap;margin:0;">${contactMsg.message}</p>
        </div>
      `,
    text: `Hi ${contactMsg.name},\n\n${text}\n\nWarmly,\n${branding.storeName}\n\n---\nOriginal message:\n${contactMsg.message}`,
  };
}

async function replyGuard(db: TenantPrisma, id: string, replyText: string | undefined) {
  if (!replyText?.trim()) {
    return fail(400, "Reply text is required");
  }
  const contactMsg = await db.contactMessage.findUnique({ where: { id } });
  if (!contactMsg) {
    return fail(404, "Message not found");
  }
  return ok(contactMsg);
}

export async function previewContactReply(db: TenantPrisma, id: string, replyText: string) {
  const g = await replyGuard(db, id, replyText);
  if (!g.ok) return g;
  const contactMsg = g.data;
  const branding = await getEmailBranding(db.$tenantId);
  const email = buildContactReplyEmail(branding, contactMsg, replyText);
  const previousReplies = await db.contactReply.count({ where: { contactMessageId: id, direction: "OUTBOUND" } });
  return ok({
    email: {
      from: email.from,
      to: email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
    },
    currentStatus: contactMsg.status,
    newStatus: "REPLIED",
    previousOutboundReplies: previousReplies,
    ...(previousReplies > 0 ? { warning: `This message already has ${previousReplies} sent repl${previousReplies === 1 ? "y" : "ies"}.` } : {}),
    note: "Sends one email via Resend (HTML version of the same text), records the reply in the thread, logs it, and marks the message REPLIED.",
  });
}

export async function sendContactReply(db: TenantPrisma, id: string, replyText: string) {
  const g = await replyGuard(db, id, replyText);
  if (!g.ok) return g;
  const contactMsg = g.data;

  const branding = await getEmailBranding(db.$tenantId);

  // Save reply to DB first
  const savedReply = await db.contactReply.create({
    data: {
      tenantId: db.$tenantId,
      contactMessageId: id,
      body: replyText.trim(),
      direction: "OUTBOUND",
      senderName: branding.storeName,
    },
  });

  // Send via Resend
  const replyResult = await resend.emails.send(buildContactReplyEmail(branding, contactMsg, replyText));

  const replyBodyHtml = replyResult.data ? (replyResult as { data?: { html?: string } }).data?.html ?? null : null;
  // Build body from the sent html (extract from request since Resend doesn't return body)
  const contactReplyHtml = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;"><p><strong>To:</strong> ${contactMsg.name} &lt;${contactMsg.email}&gt;</p><p><strong>Subject:</strong> Re: ${contactMsg.subject}</p><hr/><p style="white-space:pre-wrap;">${replyText.trim()}</p></div>`;
  await logEmail({ tenantId: db.$tenantId, type: "CONTACT_REPLY", toEmail: contactMsg.email, fromEmail: branding.fromAddress, subject: `Re: ${contactMsg.subject}`, bodyHtml: replyBodyHtml ?? contactReplyHtml, resendId: replyResult.data?.id, relatedId: id, relatedType: "CONTACT" });

  // Mark as REPLIED
  const updated = await db.contactMessage.update({
    where: { id },
    data: { status: "REPLIED" },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });

  return ok({ success: true, message: updated, reply: savedReply });
}
