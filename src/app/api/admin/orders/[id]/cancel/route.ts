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
    if (order.status === "CANCELLED" || order.status === "REFUNDED") {
      return NextResponse.json({ error: "Order is already cancelled or refunded" }, { status: 400 });
    }

    let newFinancialStatus = order.financialStatus;

    if (order.stripePaymentIntentId && order.financialStatus === "PAID") {
      // Payment already captured — issue a full refund
      try {
        const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        const chargeId = pi.latest_charge as string;
        if (chargeId) {
          await stripe.refunds.create({ charge: chargeId, reason: "requested_by_customer" });
          newFinancialStatus = "REFUNDED";
        }
      } catch (stripeErr) {
        console.error("Stripe refund error on cancel:", stripeErr);
      }
    } else if (order.stripePaymentIntentId && order.financialStatus === "AUTHORIZED") {
      // Authorized but not yet captured — cancel the hold (zero fee, no money moved)
      try {
        await stripe.paymentIntents.cancel(order.stripePaymentIntentId);
        newFinancialStatus = "VOIDED";
      } catch (stripeErr) {
        console.error("Stripe cancel error on cancel:", stripeErr);
      }
    } else if (order.stripePaymentIntentId && order.financialStatus === "PENDING") {
      // Pre-payment void
      try {
        await stripe.paymentIntents.cancel(order.stripePaymentIntentId);
        newFinancialStatus = "VOIDED";
      } catch (stripeErr) {
        console.error("Stripe void error on cancel:", stripeErr);
      }
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        financialStatus: newFinancialStatus,
        cancelledAt: new Date(),
        cancelReason: body.reason,
      },
    });

    return NextResponse.json({ order: updatedOrder, refunded: newFinancialStatus === "REFUNDED" });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/cancel error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
