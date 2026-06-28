import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import Stripe from "stripe";
import { Resend } from "resend";
import { refundIssuedHtml } from "@/lib/emails/refund-issued";
import { getEmailBranding } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
const resend = new Resend(process.env.RESEND_API_KEY);
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = await request.json() as { amount: number; restock: boolean };
    if (body.amount === undefined || body.amount === null || body.amount < 0) {
      return NextResponse.json({ error: "Invalid refund amount" }, { status: 400 });
    }
    const ret = await db.return.findUnique({
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
      if (body.amount > 0) {
        const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        const chargeId = pi.latest_charge as string;
        const refund = await stripe.refunds.create({ charge: chargeId, amount: body.amount });
        stripeRefundId = refund.id;
      }
    }
    const isPartial = body.amount < order.total;
    const newFinancialStatus = isPartial ? "PARTIALLY_REFUNDED" : "REFUNDED";
    const [updated] = await Promise.all([
      db.return.update({
        where: { id },
        data: {
          status: "REFUNDED",
          refundAmount: body.amount,
          stripeRefundId: stripeRefundId ?? null,
          resolvedAt: new Date(),
          restockItems: body.restock,
        },
      }),
      db.order.update({
        where: { id: order.id },
        data: {
          financialStatus: newFinancialStatus,
          // Full refund = order is refunded; partial = keep order status as-is
          ...(isPartial ? {} : { status: "REFUNDED" }),
        },
      }),
    ]);
    // Restock inventory if requested
    if (body.restock) {
      for (const returnItem of ret.items) {
        const orderItem = returnItem.orderItem;
        if (orderItem.variantId) {
          await db.inventory.update({
            where: { variantId: orderItem.variantId },
            data: { quantity: { increment: returnItem.quantity } },
          });
        }
      }
    }
    const branding = await getEmailBranding(db.$tenantId);
    const subject = `Your refund has been issued — ${branding.storeName}`;
    const refundResult = await resend.emails.send({
      from: branding.from,
      to: order.email,
      replyTo: branding.replyTo ?? branding.fromAddress,
      subject,
      html: refundIssuedHtml({
        orderNumber: order.orderNumber,
        email: order.email,
        refundAmount: body.amount,
        items: ret.items.map((item) => ({
          title: item.orderItem.title,
          variantTitle: item.orderItem.variantTitle ?? undefined,
          quantity: item.quantity,
        })),
      }, branding),
    });
    await logEmail({ tenantId: db.$tenantId, type: "REFUND_ISSUED", toEmail: order.email, fromEmail: branding.fromAddress, subject, resendId: refundResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/refund error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
