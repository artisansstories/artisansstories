import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require("stripe");
// Stripe webhooks are a platform/global integration: every Order touched here is
// located by a globally-unique Stripe id (stripePaymentIntentId), which Stripe —
// not our tenant model — owns. These updates therefore use the raw, unscoped
// client intentionally (no create() runs here, only updates keyed by Stripe id).
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

        // Confirm Stripe Tax transaction if not already done (backup for /confirm route)
        const taxCalculationId: string = paymentIntent.metadata?.taxCalculationId || "";
        if (taxCalculationId) {
          const order = await prisma.order.findFirst({
            where: { stripePaymentIntentId: paymentIntent.id },
            select: { id: true, orderNumber: true, stripeTaxTransactionId: true },
          });
          if (order && !order.stripeTaxTransactionId) {
            try {
              const taxTransaction = await stripe.tax.transactions.createFromCalculation({
                calculation: taxCalculationId,
                reference: order.orderNumber,
                metadata: { orderId: order.id },
              });
              await prisma.order.update({
                where: { id: order.id },
                data: { stripeTaxTransactionId: taxTransaction.id },
              });
              console.log(`Stripe Tax transaction confirmed via webhook: ${taxTransaction.id}`);
            } catch (taxErr) {
              console.error("Webhook: failed to confirm Stripe Tax transaction:", taxErr);
            }
          }
        }
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

          // A voided/released authorization (never captured) also fires charge.refunded
          // with refunded=true, but no money ever moved. Only treat as a real refund
          // when funds were actually captured. Otherwise it's a void on a cancelled order.
          const amountCaptured = charge.amount_captured ?? 0;
          const isVoidOfUncaptured = amountCaptured === 0;

          if (isVoidOfUncaptured) {
            // Auth released, $0 moved. Do NOT relabel as REFUNDED.
            // Only set VOIDED if the order isn't already in a terminal cancelled state.
            await prisma.order.updateMany({
              where: {
                stripePaymentIntentId: paymentIntentId,
                status: { notIn: ["CANCELLED", "REFUNDED"] },
              },
              data: { financialStatus: "VOIDED" },
            });
            console.log(`Auth void (no capture) for PaymentIntent: ${paymentIntentId} — not labeled as refund`);
          } else {
            const isFullRefund = charge.refunded;
            // Never downgrade an order that was explicitly cancelled by admin.
            await prisma.order.updateMany({
              where: {
                stripePaymentIntentId: paymentIntentId,
                status: { not: "CANCELLED" },
              },
              data: {
                financialStatus: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
                status: isFullRefund ? "REFUNDED" : undefined,
              },
            });
            // For cancelled orders, just record the refund financially without changing status.
            await prisma.order.updateMany({
              where: {
                stripePaymentIntentId: paymentIntentId,
                status: "CANCELLED",
              },
              data: {
                financialStatus: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
              },
            });
            console.log(`Order refund processed for PaymentIntent: ${paymentIntentId}`);
          }
        }
        break;
      }

      // ── Stripe Connect (P4) ───────────────────────────────────────────────
      // Connected-account events arrive on this same endpoint with `event.account`
      // set to the `acct_…` id. Tenant is a platform/global model, so these use
      // the raw client keyed by the globally-unique Stripe ids (account id /
      // checkout session id) — consistent with the embedded handlers above.
      case "account.updated": {
        const account = event.data.object;
        // Only flip onboarding on when the account can actually take charges.
        if (account.charges_enabled) {
          const updated = await prisma.tenant.updateMany({
            where: { stripeConnectAccountId: account.id },
            data: { stripeOnboarded: true },
          });
          if (updated.count > 0) {
            console.log(`Tenant onboarded (charges_enabled) for account: ${account.id}`);
          }
        }
        break;
      }

      case "checkout.session.completed": {
        const checkoutSession = event.data.object;
        // Reconcile the PENDING Order we recorded before the redirect. Keyed by
        // the globally-unique checkout session id (raw client, intentional).
        const order = await prisma.order.findFirst({
          where: { stripeCheckoutSessionId: checkoutSession.id },
          select: { id: true, tenantId: true, orderNumber: true, email: true },
        });

        if (!order) {
          // Could be an embedded-flow session or a session we don't track — be
          // tolerant and acknowledge so Stripe doesn't retry forever.
          console.log(`No tracked Order for checkout session: ${checkoutSession.id}`);
          break;
        }

        const paymentIntentId =
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id ?? null;
        const customerEmail =
          checkoutSession.customer_details?.email || checkoutSession.customer_email || order.email || "";

        await prisma.order.update({
          where: { id: order.id },
          data: {
            financialStatus: "PAID",
            status: "PROCESSING",
            ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
            ...(customerEmail ? { email: customerEmail } : {}),
          },
        });

        // Record the confirmation/receipt. tenantId is set EXPLICITLY from the
        // order so the EmailLog row is owned by the correct tenant (the raw
        // client does not auto-scope writes).
        try {
          await prisma.emailLog.create({
            data: {
              tenantId: order.tenantId,
              type: "ORDER_CONFIRMATION",
              direction: "OUTBOUND",
              toEmail: customerEmail || order.email || "",
              subject: `Order confirmation ${order.orderNumber}`,
              relatedId: order.id,
              relatedType: "Order",
            },
          });
        } catch (emailErr) {
          console.error("Webhook: failed to write order-confirmation EmailLog:", emailErr);
        }

        console.log(`Connect checkout completed → Order ${order.orderNumber} PAID/PROCESSING`);
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
