import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { Resend } from "resend";
import { returnApprovedHtml } from "@/lib/emails/return-approved";
import { getEmailBranding } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
const resend = new Resend(process.env.RESEND_API_KEY);
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const ret = await db.return.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, orderNumber: true, email: true } },
        items: {
          include: {
            orderItem: { select: { title: true, variantTitle: true } },
          },
        },
      },
    });
    if (!ret) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    if (ret.status !== "REQUESTED") {
      return NextResponse.json({ error: "Return is not in REQUESTED status" }, { status: 400 });
    }
    const updated = await db.return.update({
      where: { id },
      data: { status: "APPROVED" },
    });
    const branding = await getEmailBranding(db.$tenantId);
    const subject = `Your return has been approved — ${branding.storeName}`;
    const approveResult = await resend.emails.send({
      from: branding.from,
      to: ret.order.email,
      replyTo: branding.replyTo ?? branding.fromAddress,
      subject,
      html: returnApprovedHtml({
        orderNumber: ret.order.orderNumber,
        email: ret.order.email,
        returnId: ret.id,
        items: ret.items.map((item) => ({
          title: item.orderItem.title,
          variantTitle: item.orderItem.variantTitle ?? undefined,
          quantity: item.quantity,
        })),
      }, branding),
    });
    await logEmail({ tenantId: db.$tenantId, type: "RETURN_APPROVED", toEmail: ret.order.email, fromEmail: branding.fromAddress, subject, resendId: approveResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/approve error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
