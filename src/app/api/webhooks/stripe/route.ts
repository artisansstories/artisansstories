import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require("stripe");
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new StripeSDK(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" }) as any;

export async function POST(request: NextRequest) {
  // Check if webhook secret is configured
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn("STRIPE_WEBHOOK_SECRET not set — skipping webhook verification (dev mode)");
    return NextResponse.json({ received: true, note: "dev mode — no signature verification" });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        await prisma.order.updateMany({
          where: { stripePaymentIntentId: paymentIntent.id },
          data: {
            financialStatus: "PAID",
            status: "PROCESSING",
          },
        });
        console.log(`Order updated to PAID/PROCESSING for PaymentIntent: ${paymentIntent.id}`);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        await prisma.order.updateMany({
          where: { stripePaymentIntentId: paymentIntent.id },
          data: {
            financialStatus: "PENDING",
          },
        });
        console.log(`Order payment failed for PaymentIntent: ${paymentIntent.id}`);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        if (charge.payment_intent) {
          const paymentIntentId =
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : charge.payment_intent.id;

          const isFullRefund = charge.refunded;
          await prisma.order.updateMany({
            where: { stripePaymentIntentId: paymentIntentId },
            data: {
              financialStatus: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
              status: isFullRefund ? "REFUNDED" : undefined,
            },
          });
          console.log(`Order refund processed for PaymentIntent: ${paymentIntentId}`);
        }
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
