import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { logEmail } from "@/lib/email-log";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as { replyText: string };

    if (!body.replyText?.trim()) {
      return NextResponse.json({ error: "Reply text is required" }, { status: 400 });
    }

    const contactMsg = await prisma.contactMessage.findUnique({ where: { id } });
    if (!contactMsg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Save reply to DB first
    const savedReply = await prisma.contactReply.create({
      data: {
        contactMessageId: id,
        body: body.replyText.trim(),
        direction: "OUTBOUND",
        senderName: "Artisans' Stories",
      },
    });

    // Send via Resend
    const replyResult = await resend.emails.send({
      from: "Artisans' Stories <hello@artisansstories.com>",
      to: [contactMsg.email],
      replyTo: "hello@artisansstories.com",
      subject: `Re: ${contactMsg.subject}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
          <div style="padding:28px 32px;text-align:center;border-bottom:1px solid #ede8df;">
            <img src="https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/artisansstories-logo.png" alt="Artisans' Stories" width="400" style="display:block;margin:0 auto;width:400px;max-width:90%;height:auto;" />
          </div>
          <div style="padding:32px 40px;">
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;color:#3a2e24;margin:0 0 16px;">Hi ${contactMsg.name},</p>
            <div style="font-size:15px;color:#3a2e24;line-height:1.7;white-space:pre-wrap;margin:0 0 24px;">${body.replyText.trim()}</div>
            <div style="border-top:1px solid #ede8df;padding-top:20px;">
              <p style="font-size:13px;color:#9a876e;margin:0 0 4px;">Warmly,</p>
              <p style="font-size:14px;font-weight:600;color:#3a2e24;margin:0;">Anna · Artisans' Stories</p>
            </div>
          </div>
          <div style="padding:16px 40px;background:#3a2e24;text-align:center;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.4);">&copy; ${new Date().getFullYear()} Artisans' Stories. All rights reserved.</p>
          </div>
        </div>
        <div style="margin-top:24px;padding:16px 20px;background:#f5f5f5;border-radius:8px;font-family:Inter,sans-serif;border-left:3px solid #d8cfc0;">
          <p style="font-size:11px;color:#999;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Original message from ${contactMsg.name}</p>
          <p style="font-size:13px;color:#666;line-height:1.6;white-space:pre-wrap;margin:0;">${contactMsg.message}</p>
        </div>
      `,
      text: `Hi ${contactMsg.name},\n\n${body.replyText.trim()}\n\nWarmly,\nAnna · Artisans' Stories\n\n---\nOriginal message:\n${contactMsg.message}`,
    });

    const replyBodyHtml = replyResult.data ? (replyResult as { data?: { html?: string } }).data?.html ?? null : null;
    // Build body from the sent html (extract from request since Resend doesn't return body)
    const contactReplyHtml = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;"><p><strong>To:</strong> ${contactMsg.name} &lt;${contactMsg.email}&gt;</p><p><strong>Subject:</strong> Re: ${contactMsg.subject}</p><hr/><p style="white-space:pre-wrap;">${body.replyText.trim()}</p></div>`;
    await logEmail({ type: "CONTACT_REPLY", toEmail: contactMsg.email, subject: `Re: ${contactMsg.subject}`, bodyHtml: replyBodyHtml ?? contactReplyHtml, resendId: replyResult.data?.id, relatedId: id, relatedType: "CONTACT" });

    // Mark as REPLIED
    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: "REPLIED" },
      include: { replies: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ success: true, message: updated, reply: savedReply });
  } catch (error) {
    console.error("POST /api/admin/contact/[id]/reply error:", error);
    return NextResponse.json({ error: "Failed to send reply" }, { status: 500 });
  }
}
