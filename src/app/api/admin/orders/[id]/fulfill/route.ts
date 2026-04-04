import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { orderShippedHtml } from "@/lib/emails/order-shipped";

const resend = new Resend(process.env.RESEND_API_KEY);

interface FulfillBody {
  trackingCompany: string;
  trackingNumber: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  notifyCustomer: boolean;
  items: Array<{ orderItemId: string; quantity: number }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = (await request.json()) as FulfillBody;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Create fulfillment record
    const fulfillment = await prisma.fulfillment.create({
      data: {
        orderId: id,
        status: "SUCCESS",
        trackingCompany: body.trackingCompany,
        trackingNumber: body.trackingNumber,
        trackingUrl: body.trackingUrl ?? null,
        shippedAt: new Date(),
        estimatedDelivery: body.estimatedDelivery ? new Date(body.estimatedDelivery) : null,
        notifyCustomer: body.notifyCustomer,
        items: body.items,
      },
    });

    // Update fulfillment status on order items
    await Promise.all(
      body.items.map((fi) =>
        prisma.orderItem.update({
          where: { id: fi.orderItemId },
          data: { fulfillmentStatus: "fulfilled" },
        })
      )
    );

    // Check if all items are now fulfilled
    const updatedItems = await prisma.orderItem.findMany({ where: { orderId: id } });
    const allFulfilled = updatedItems.every((item) => item.fulfillmentStatus === "fulfilled");

    if (allFulfilled) {
      await prisma.order.update({
        where: { id },
        data: { status: "FULFILLED" },
      });
    }

    // Send shipped email
    if (body.notifyCustomer) {
      const emailItems = order.items.map((item) => {
        const snapshot = item.productSnapshot as Record<string, unknown>;
        return {
          title: item.title,
          variantTitle: item.variantTitle ?? undefined,
          quantity: item.quantity,
          image: (snapshot?.image as string) ?? undefined,
        };
      });

      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM ?? "hello@artisansstories.com",
          to: order.email,
          subject: `Your order ${order.orderNumber} has shipped!`,
          html: orderShippedHtml({
            orderNumber: order.orderNumber,
            email: order.email,
            trackingCompany: body.trackingCompany,
            trackingNumber: body.trackingNumber,
            trackingUrl: body.trackingUrl,
            estimatedDelivery: body.estimatedDelivery,
            items: emailItems,
          }),
        });
      } catch (emailErr) {
        console.error("Failed to send shipped email:", emailErr);
      }
    }

    return NextResponse.json({ fulfillment });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/fulfill error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
