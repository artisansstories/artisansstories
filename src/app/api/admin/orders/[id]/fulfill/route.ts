import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { Resend } from "resend";
import { orderShippedHtml } from "@/lib/emails/order-shipped";
import { logEmail } from "@/lib/email-log";
import Stripe from "stripe";
import crypto from "crypto";
const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2025-01-27.acacia" });
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
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = (await request.json()) as FulfillBody;
    const order = await db.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    // Create fulfillment record
    const fulfillment = await db.fulfillment.create({
      data: {
        tenantId: db.$tenantId,
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
        db.orderItem.update({
          where: { id: fi.orderItemId },
          data: { fulfillmentStatus: "fulfilled" },
        })
      )
    );
    // Check if all items are now fulfilled
    const updatedItems = await db.orderItem.findMany({ where: { orderId: id } });
    const allFulfilled = updatedItems.every((item) => item.fulfillmentStatus === "fulfilled");

    // Capture payment if authorized (manual capture mode)
    let newFinancialStatus = order.financialStatus;
    if (allFulfilled && order.financialStatus === "AUTHORIZED" && order.stripePaymentIntentId) {
      try {
        await stripe.paymentIntents.capture(order.stripePaymentIntentId);
        newFinancialStatus = "PAID";
        console.log(`Captured payment for order ${order.orderNumber}`);
      } catch (captureErr) {
        // Log but don't block fulfillment — handle manually if needed
        console.error("Failed to capture Stripe payment on fulfill:", captureErr);
      }
    }

    if (allFulfilled) {
      // If tracking was provided, order is now SHIPPED; otherwise FULFILLED (packed, awaiting carrier)
      const newStatus = body.trackingNumber?.trim() ? "SHIPPED" : "FULFILLED";
      await db.order.update({
        where: { id },
        data: {
          status: newStatus,
          financialStatus: newFinancialStatus,
        },
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

      // Generate pre-auth magic link for shipped email (7 day expiry)
      let viewOrderUrl: string | undefined;
      try {
        const mlToken = crypto.randomBytes(32).toString("hex");
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
        // Intentional global-prisma exemption: MagicLinkToken is NOT a tenant-scoped
        // model — it's keyed by its globally-unique secret `token` and excluded from
        // TENANT_SCOPED_MODELS. The tenant is passed explicitly (db.$tenantId), so this
        // is correct by design; the scoped client would not auto-stamp it.
        await prisma.magicLinkToken.create({
          data: {
            tenantId: db.$tenantId,
            token: mlToken,
            email: order.email,
            type: "CUSTOMER",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        viewOrderUrl = `${siteUrl}/api/auth/customer/verify?token=${encodeURIComponent(mlToken)}&redirect=${encodeURIComponent('/account/orders/' + order.orderNumber)}`;
      } catch (mlErr) {
        console.error("Failed to create magic link for shipped email:", mlErr);
      }

      try {
        const shipResult = await resend.emails.send({
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
            viewOrderUrl,
          }),
        });
        const shippedHtml = orderShippedHtml({ orderNumber: order.orderNumber, email: order.email, trackingCompany: body.trackingCompany, trackingNumber: body.trackingNumber, trackingUrl: body.trackingUrl, estimatedDelivery: body.estimatedDelivery, items: emailItems, viewOrderUrl });
        await logEmail({ type: "ORDER_SHIPPED", toEmail: order.email, subject: `Your order ${order.orderNumber} has shipped!`, bodyHtml: shippedHtml, resendId: shipResult.data?.id, relatedId: order.id, relatedType: "ORDER" });
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
