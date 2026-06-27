import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import Stripe from "stripe";
import { Resend } from "resend";
import { orderCancelledHtml } from "@/lib/emails/order-cancelled";
import { logEmail } from "@/lib/email-log";

const resend = new Resend(process.env.RESEND_API_KEY);

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
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = (await request.json()) as CancelBody;
    const order = await db.order.findUnique({ where: { id } });
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

    const updatedOrder = await db.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        financialStatus: newFinancialStatus,
        cancelledAt: new Date(),
        cancelReason: body.reason,
      },
    });

    // Send cancellation email
    try {
      const customer = updatedOrder.customerId
        ? await db.customer.findUnique({ where: { id: updatedOrder.customerId }, select: { firstName: true } })
        : null;
      const refunded = newFinancialStatus === "REFUNDED";
      const html = orderCancelledHtml({
        orderNumber: updatedOrder.orderNumber,
        email: updatedOrder.email,
        firstName: customer?.firstName ?? undefined,
        cancelReason: body.reason || undefined,
        refunded,
        total: updatedOrder.total,
      });
      const result = await resend.emails.send({
        from: "Artisans' Stories <hello@artisansstories.com>",
        to: updatedOrder.email,
        replyTo: "hello@artisansstories.com",
        subject: `Your order ${updatedOrder.orderNumber} has been cancelled`,
        html,
      });
      const type = refunded ? "ORDER_REFUNDED" as const : "ORDER_CANCELLED" as const;
      await logEmail({ type, toEmail: updatedOrder.email, subject: `Your order ${updatedOrder.orderNumber} has been cancelled`, bodyHtml: html, resendId: result.data?.id, relatedId: updatedOrder.id, relatedType: "ORDER" });
    } catch (emailErr) {
      console.error("Failed to send cancellation email:", emailErr);
    }

    return NextResponse.json({ order: updatedOrder, refunded: newFinancialStatus === "REFUNDED" });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/cancel error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
