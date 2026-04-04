import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { orderConfirmationHtml } from "@/lib/emails/order-confirmation";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const shippingAddress = order.shippingAddress as {
      firstName: string;
      lastName: string;
      address1: string;
      address2?: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };

    const emailItems = order.items.map((item) => {
      const snapshot = item.productSnapshot as Record<string, unknown>;
      return {
        title: item.title,
        variantTitle: item.variantTitle ?? undefined,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        image: (snapshot?.image as string) ?? undefined,
      };
    });

    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "hello@artisansstories.com",
      to: order.email,
      subject: `Order Confirmed — ${order.orderNumber}`,
      html: orderConfirmationHtml({
        orderNumber: order.orderNumber,
        email: order.email,
        items: emailItems,
        subtotal: order.subtotal,
        shippingTotal: order.shippingTotal,
        taxTotal: order.taxTotal,
        discountTotal: order.discountTotal,
        total: order.total,
        shippingAddress,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/resend-email error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
