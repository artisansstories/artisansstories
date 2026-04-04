import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { returnRejectedHtml } from "@/lib/emails/return-rejected";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to: ret.order.email,
      subject: "Update on your return request — Artisans Stories",
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

    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/reject error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
