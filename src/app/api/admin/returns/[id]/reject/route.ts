import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { Resend } from "resend";
import { returnRejectedHtml } from "@/lib/emails/return-rejected";
import { getEmailBranding } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
const resend = new Resend(process.env.RESEND_API_KEY);
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = await request.json() as { reason: string };
    if (!body.reason) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }
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
    if (ret.status !== "REQUESTED" && ret.status !== "APPROVED") {
      return NextResponse.json({ error: "Return cannot be rejected in its current status" }, { status: 400 });
    }
    const updated = await db.return.update({
      where: { id },
      data: {
        status: "REJECTED",
        adminNote: body.reason,
        resolvedAt: new Date(),
      },
    });
    const branding = await getEmailBranding(db.$tenantId);
    const subject = `Update on your return request — ${branding.storeName}`;
    const rejectResult = await resend.emails.send({
      from: branding.from,
      to: ret.order.email,
      replyTo: branding.replyTo ?? branding.fromAddress,
      subject,
      html: returnRejectedHtml({
        orderNumber: ret.order.orderNumber,
        email: ret.order.email,
        reason: body.reason,
        items: ret.items.map((item) => ({
          title: item.orderItem.title,
          variantTitle: item.orderItem.variantTitle ?? undefined,
          quantity: item.quantity,
        })),
      }, branding),
    });
    await logEmail({ tenantId: db.$tenantId, type: "RETURN_REJECTED", toEmail: ret.order.email, fromEmail: branding.fromAddress, subject, resendId: rejectResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/reject error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
