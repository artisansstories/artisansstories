import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-01-27.acacia",
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json() as { amount?: number; reason?: string };

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (!["PAID", "PARTIALLY_REFUNDED"].includes(order.financialStatus)) {
      const hint = order.financialStatus === "AUTHORIZED"
        ? "Payment is authorized but not yet captured. Cancel the order to release the hold with no fees."
        : "Order is not in a refundable state";
      return NextResponse.json({ error: hint }, { status: 400 });
    }

    if (!order.stripePaymentIntentId) {
      return NextResponse.json({ error: "No Stripe payment found for this order" }, { status: 400 });
    }

    // Get the charge from the PaymentIntent
    const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    const chargeId = pi.latest_charge as string;
    if (!chargeId) {
      return NextResponse.json({ error: "No charge found on this payment" }, { status: 400 });
    }

    // Refund amount: partial if specified, full if not
    const refundAmount = body.amount && body.amount > 0 ? body.amount : undefined;

    const refund = await stripe.refunds.create({
      charge: chargeId,
      ...(refundAmount ? { amount: refundAmount } : {}),
      reason: "requested_by_customer",
    });

    // Determine new financial status
    const isFullRefund = !refundAmount || refundAmount >= order.total;
    const newFinancialStatus = isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED";
    const newStatus = isFullRefund ? "REFUNDED" : order.status;

    await prisma.order.update({
      where: { id },
      data: {
        financialStatus: newFinancialStatus,
        status: newStatus,
        updatedAt: new Date(),
        adminNote: order.adminNote
          ? `${order.adminNote}\n\nRefund issued: ${body.reason ?? "Admin initiated"} (${new Date().toLocaleDateString()})`
          : `Refund issued: ${body.reason ?? "Admin initiated"} (${new Date().toLocaleDateString()})`,
      },
    });

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amount: refund.amount,
      status: refund.status,
    });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/refund error:", err);
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
