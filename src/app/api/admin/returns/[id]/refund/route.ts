import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { Resend } from "resend";
import { refundIssuedHtml } from "@/lib/emails/refund-issued";
const resend = new Resend(process.env.RESEND_API_KEY);
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const body = await request.json() as { amount: number; restock: boolean };
    if (!body.amount || body.amount <= 0) {
      return NextResponse.json({ error: "Invalid refund amount" }, { status: 400 });
    }
    const ret = await prisma.return.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            email: true,
            total: true,
            stripePaymentIntentId: true,
            financialStatus: true,
          },
        },
        items: {
          include: {
            orderItem: {
              select: {
                id: true,
                title: true,
                variantTitle: true,
                variantId: true,
              },
            },
          },
        },
      },
    });
    if (!ret) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    const order = ret.order;
    if (body.amount > order.total) {
      return NextResponse.json({ error: "Refund amount cannot exceed order total" }, { status: 400 });
    }
    let stripeRefundId: string | undefined;
    if (order.stripePaymentIntentId) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2025-01-27.acacia",
      });
      const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
      const chargeId = pi.latest_charge as string;
      const refund = await stripe.refunds.create({ charge: chargeId, amount: body.amount });
      stripeRefundId = refund.id;
    }
    const isPartial = body.amount < order.total;
    const newFinancialStatus = isPartial ? "PARTIALLY_REFUNDED" : "REFUNDED";
    const [updated] = await Promise.all([
      prisma.return.update({
        where: { id },
        data: {
          status: "REFUNDED",
          refundAmount: body.amount,
          stripeRefundId: stripeRefundId ?? null,
          resolvedAt: new Date(),
          restockItems: body.restock,
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { financialStatus: newFinancialStatus },
      }),
    ]);
    // Restock inventory if requested
    if (body.restock) {
      for (const returnItem of ret.items) {
        const orderItem = returnItem.orderItem;
        if (orderItem.variantId) {
          await prisma.inventory.update({
            where: { variantId: orderItem.variantId },
            data: { quantity: { increment: returnItem.quantity } },
          });
        }
      }
    }
    await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to: order.email,
      subject: "Your refund has been issued — Artisans' Stories",
      html: refundIssuedHtml({
        orderNumber: order.orderNumber,
        email: order.email,
        refundAmount: body.amount,
        items: ret.items.map((item) => ({
          title: item.orderItem.title,
          variantTitle: item.orderItem.variantTitle ?? undefined,
          quantity: item.quantity,
        })),
      }),
    });
    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/refund error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
