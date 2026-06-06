import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { returnRejectedHtml } from "@/lib/emails/return-rejected";
import { logEmail } from "@/lib/email-log";
const resend = new Resend(process.env.RESEND_API_KEY);
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const body = await request.json() as { reason: string };
    if (!body.reason) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }
    const ret = await prisma.return.findUnique({
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
    const updated = await prisma.return.update({
      where: { id },
      data: {
        status: "REJECTED",
        adminNote: body.reason,
        resolvedAt: new Date(),
      },
    });
    const rejectResult = await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to: ret.order.email,
      subject: "Update on your return request — Artisans' Stories",
      html: returnRejectedHtml({
        orderNumber: ret.order.orderNumber,
        email: ret.order.email,
        reason: body.reason,
        items: ret.items.map((item) => ({
          title: item.orderItem.title,
          variantTitle: item.orderItem.variantTitle ?? undefined,
          quantity: item.quantity,
        })),
      }),
    });
    await logEmail({ type: "RETURN_REJECTED", toEmail: ret.order.email, subject: "Update on your return request — Artisans' Stories", resendId: rejectResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/reject error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
