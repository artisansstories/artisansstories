import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { returnApprovedHtml } from "@/lib/emails/return-approved";
const resend = new Resend(process.env.RESEND_API_KEY);
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
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
    if (ret.status !== "REQUESTED") {
      return NextResponse.json({ error: "Return is not in REQUESTED status" }, { status: 400 });
    }
    const updated = await prisma.return.update({
      where: { id },
      data: { status: "APPROVED" },
    });
    await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to: ret.order.email,
      subject: "Your return has been approved — Artisans' Stories",
      html: returnApprovedHtml({
        orderNumber: ret.order.orderNumber,
        email: ret.order.email,
        returnId: ret.id,
        items: ret.items.map((item) => ({
          title: item.orderItem.title,
          variantTitle: item.orderItem.variantTitle ?? undefined,
          quantity: item.quantity,
        })),
      }),
    });
    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/approve error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
