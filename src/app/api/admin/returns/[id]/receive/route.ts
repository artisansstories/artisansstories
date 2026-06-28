import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { Resend } from "resend";
import { getEmailBranding, emailLogoHtml } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
const resend = new Resend(process.env.RESEND_API_KEY);
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const ret = await db.return.findUnique({ where: { id } });
    if (!ret) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    if (ret.status !== "APPROVED") {
      return NextResponse.json({ error: "Return must be APPROVED before marking as received" }, { status: 400 });
    }
    const retWithOrder = await db.return.findUnique({
      where: { id },
      include: { order: { select: { email: true, orderNumber: true, id: true } } },
    });
    const updated = await db.return.update({
      where: { id },
      data: { status: "RECEIVED" },
    });
    // Notify customer we received the return
    if (retWithOrder?.order) {
      try {
        const branding = await getEmailBranding(db.$tenantId);
        const year = new Date().getFullYear();
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;"><tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="padding:28px 32px;text-align:center;border-bottom:1px solid #ede8df;">
${emailLogoHtml(branding)}</td></tr>
<tr><td style="padding:36px 40px;text-align:center;">
<h2 style="margin:0 0 12px;font-size:24px;color:#3a2e24;font-weight:700;">We received your return</h2>
<p style="margin:0 0 16px;font-size:15px;color:#7a6852;">We've received the items for order <strong>${retWithOrder.order.orderNumber}</strong> and are reviewing them now.</p>
<p style="margin:0;font-size:14px;color:#9a876e;">You'll hear from us shortly regarding your refund. Questions? <a href="mailto:${branding.fromAddress}" style="color:${branding.accentColor};">${branding.fromAddress}</a></p>
</td></tr>
<tr><td style="padding:20px 40px;background:#3a2e24;text-align:center;"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.4);">&copy; ${year} ${branding.storeName}</p></td></tr>
</table></td></tr></table></body></html>`;
        const result = await resend.emails.send({
          from: branding.from,
          to: retWithOrder.order.email,
          replyTo: branding.replyTo ?? branding.fromAddress,
          subject: `We received your return for order ${retWithOrder.order.orderNumber}`,
          html,
        });
        await logEmail({ tenantId: db.$tenantId, type: "RETURN_APPROVED", toEmail: retWithOrder.order.email, fromEmail: branding.fromAddress, subject: `We received your return for order ${retWithOrder.order.orderNumber}`, bodyHtml: html, resendId: result.data?.id, relatedId: retWithOrder.order.id, relatedType: "ORDER" });
      } catch (e) { console.error("Failed to send return received email:", e); }
    }
    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/receive error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
