import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-01-27.acacia",
});
interface CancelBody {
  reason: string;
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const body = (await request.json()) as CancelBody;
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.status === "CANCELLED") {
      return NextResponse.json({ error: "Order is already cancelled" }, { status: 400 });
    }
    // Void Stripe PaymentIntent if paid
    if (order.stripePaymentIntentId && order.financialStatus === "PAID") {
      try {
        await stripe.paymentIntents.cancel(order.stripePaymentIntentId);
      } catch (stripeErr) {
        console.error("Stripe void error:", stripeErr);
      }
    }
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        financialStatus: order.financialStatus === "PENDING" ? "VOIDED" : order.financialStatus,
        cancelledAt: new Date(),
        cancelReason: body.reason,
      },
    });
    return NextResponse.json({ order: updatedOrder });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/cancel error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
