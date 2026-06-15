import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require("stripe");
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { orderConfirmationHtml } from "@/lib/emails/order-confirmation";
import { logEmail } from "@/lib/email-log";
import { Resend } from "resend";
import crypto from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new StripeSDK(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" }) as any;

const resend = new Resend(process.env.RESEND_API_KEY);

interface AddonPayload {
  type: string;
  data: Record<string, unknown>;
}

interface CartItem {
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  price: number;
  quantity: number;
  image?: string;
  slug: string;
  sku?: string;
  addons?: AddonPayload[];
}

interface ShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  stateCode: string;
  zip: string;
  country: string;
  countryCode: string;
}

const VALID_MONOGRAM_FONTS = ['Anonymous Pro', 'Happy Monkey', 'Oregano'];
const VALID_MONOGRAM_STYLES = ['INITIALS', 'FULL_NAME'];

// Re-validate + sanitize addon data server-side before persisting. The confirm
// route trusts the request body (prices are re-derived from the DB), so addon
// text must be cleaned here too: strip HTML, trim, clamp length, and drop any
// addon with an unknown type/font/style. Returns undefined when nothing valid
// remains so productSnapshot/email/OrderItemAddon all see the same clean data.
function sanitizeAddons(addons?: AddonPayload[]): AddonPayload[] | undefined {
  if (!addons || addons.length === 0) return undefined;
  const clean: AddonPayload[] = [];
  for (const addon of addons) {
    if (addon.type === 'LASER_MONOGRAM') {
      const rawText = typeof addon.data?.text === 'string' ? addon.data.text : '';
      const text = rawText.replace(/<[^>]*>/g, '').trim().slice(0, 50);
      const font = addon.data?.font;
      const style = addon.data?.style;
      if (!text) continue;
      if (typeof font !== 'string' || !VALID_MONOGRAM_FONTS.includes(font)) continue;
      if (typeof style !== 'string' || !VALID_MONOGRAM_STYLES.includes(style)) continue;
      clean.push({ type: 'LASER_MONOGRAM', data: { text, font, style } });
    }
  }
  return clean.length > 0 ? clean : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      paymentIntentId,
      email,
      phone,
      items,
      shippingAddress,
      shippingRateId,
      discountCode,
    } = body as {
      paymentIntentId: string;
      email: string;
      phone?: string;
      items: CartItem[];
      shippingAddress: ShippingAddress;
      shippingRateId: string;
      discountCode?: string;
    };

    if (!paymentIntentId || !email || !items || !shippingAddress || !shippingRateId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Sanitize addon data once, up front, so every downstream consumer
    // (productSnapshot, OrderItemAddon records, confirmation email) uses the
    // same cleaned, validated values rather than raw client input.
    for (const item of items) {
      item.addons = sanitizeAddons(item.addons);
    }

    // Free order path (100% discount — no Stripe charge)
    const isFreeOrder = paymentIntentId.startsWith("free_");

    // Verify the PaymentIntent — accept 'succeeded' (immediate) or 'requires_capture' (manual capture)
    let isAuthorizedOnly = false;
    if (!isFreeOrder) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const validStatuses = ["succeeded", "requires_capture"];
      if (!validStatuses.includes(paymentIntent.status)) {
        return NextResponse.json(
          { error: `Payment not completed. Status: ${paymentIntent.status}` },
          { status: 400 }
        );
      }
      isAuthorizedOnly = paymentIntent.status === "requires_capture";
    }

    // Check for duplicate order
    const existingOrder = await prisma.order.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (existingOrder) {
      return NextResponse.json({
        orderNumber: existingOrder.orderNumber,
        orderId: existingOrder.id,
      });
    }

    // Generate order number
    const orderNumber = `AS-${Date.now()}`;

    // Find or create Customer
    let customer = await prisma.customer.findUnique({ where: { email } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          email,
          phone: phone || null,
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
        },
      });
    }

    // Fetch variants from DB for productSnapshot and price calculation
    const variantIds = items.map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          include: { images: { where: { isDefault: true }, take: 1 } },
        },
        inventory: true,
      },
    });

    // Calculate totals from DB prices
    let subtotal = 0;
    for (const item of items) {
      const variant = variants.find((v) => v.id === item.variantId);
      if (!variant) continue;
      const price = variant.price ?? variant.product.price;
      subtotal += price * item.quantity;
    }

    // Fetch shipping rate
    const shippingRate = await prisma.shippingRate.findUnique({
      where: { id: shippingRateId },
    });
    const shippingTotal = shippingRate?.price ?? 0;

    // Apply discount
    let discountTotal = 0;
    let validatedDiscountCode: string | undefined;
    let discountRecord: { id: string; type: string; value: number } | null = null;
    if (discountCode) {
      const discount = await prisma.discount.findUnique({
        where: { code: discountCode.toUpperCase() },
      });
      if (discount && discount.isActive) {
        const now = new Date();
        const notExpired = !discount.endsAt || discount.endsAt > now;
        const notExceeded = !discount.usageLimit || discount.usageCount < discount.usageLimit;
        const meetsMinimum = !discount.minimumOrderAmount || subtotal >= discount.minimumOrderAmount;

        if (notExpired && notExceeded && meetsMinimum) {
          if (discount.type === "PERCENTAGE") {
            discountTotal = Math.floor((subtotal * discount.value) / 100);
            // 100% off = entire order free, including shipping
            if (discount.value >= 100) {
              discountTotal = subtotal + shippingTotal;
            }
          } else if (discount.type === "FIXED_AMOUNT") {
            discountTotal = Math.min(discount.value, subtotal);
          } else if (discount.type === "FREE_SHIPPING") {
            discountTotal = shippingTotal;
          }
          validatedDiscountCode = discount.code;
          discountRecord = { id: discount.id, type: discount.type, value: discount.value };
        }
      }
    }

    // Get taxTotal from PaymentIntent metadata (set by Stripe Tax during create-payment-intent)
    let taxTotal = 0;
    let taxCalculationId = "";
    if (!isFreeOrder) {
      const piForMeta = await stripe.paymentIntents.retrieve(paymentIntentId);
      taxTotal = parseInt(piForMeta.metadata?.taxTotal || "0", 10);
      taxCalculationId = piForMeta.metadata?.taxCalculationId || "";
    }

    const total = Math.max(0, subtotal - discountTotal + shippingTotal + taxTotal);

    // Create Order and OrderItems in a transaction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          customerId: customer!.id,
          email,
          phone: phone || null,
          shippingAddress: shippingAddress as object,
          subtotal,
          discountTotal,
          shippingTotal,
          taxTotal,
          total,
          currency: "usd",
          stripePaymentIntentId: paymentIntentId,
          discountCode: validatedDiscountCode || null,
          financialStatus: isAuthorizedOnly ? "AUTHORIZED" : "PAID",
          status: "PROCESSING",
          items: {
            create: items.map((item) => {
              const variant = variants.find((v) => v.id === item.variantId);
              const price = variant?.price ?? variant?.product.price ?? item.price;
              const totalPrice = price * item.quantity;
              const productImage =
                item.image ||
                variant?.product.images?.[0]?.url ||
                null;

              return {
                productId: item.productId || null,
                variantId: item.variantId,
                title: item.name,
                variantTitle: item.variantName || null,
                sku: item.sku || null,
                quantity: item.quantity,
                price,
                total: totalPrice,
                requiresShipping: variant?.product.requiresShipping ?? true,
                productSnapshot: {
                  name: item.name,
                  variantName: item.variantName,
                  price,
                  image: productImage,
                  sku: item.sku,
                  addons: item.addons ?? [],
                } as unknown as Prisma.JsonObject,
              };
            }),
          },
        },
        include: { items: true },
      });

      return newOrder;
    });

    // Create OrderItemAddon records for each item with addons.
    // Claim order items positionally per variant (tracking consumed ids) so that
    // when the same variant appears in multiple line items — e.g. one plain and
    // one monogrammed — addons attach to the right item instead of always the
    // first match.
    const orderItems = (order as unknown as { items: { id: string; variantId: string | null }[] }).items;
    const consumedOrderItemIds = new Set<string>();
    for (const item of items) {
      const orderItem = orderItems.find(
        (oi) => oi.variantId === item.variantId && !consumedOrderItemIds.has(oi.id)
      );
      if (!orderItem) continue;
      consumedOrderItemIds.add(orderItem.id);
      if (item.addons && item.addons.length > 0) {
        try {
          await prisma.orderItemAddon.createMany({
            data: item.addons.map(addon => ({
              orderItemId: orderItem.id,
              type: addon.type as 'LASER_MONOGRAM',
              data: addon.data as Prisma.JsonObject,
              price: 0,
            })),
          });
        } catch (addonErr) {
          console.error(`Failed to create addon records for order item ${orderItem.id}:`, addonErr);
        }
      }
    }

    // Confirm tax calculation with Stripe Tax (records it in tax reports)
    if (taxCalculationId) {
      try {
        const taxTransaction = await stripe.tax.transactions.createFromCalculation({
          calculation: taxCalculationId,
          reference: orderNumber,
          metadata: { orderId: order.id },
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { stripeTaxTransactionId: taxTransaction.id },
        });
      } catch (taxErr) {
        // Non-fatal: log and continue. Tax transaction can be reconciled manually.
        console.error("Failed to confirm Stripe Tax transaction (order created successfully):", taxErr);
      }
    }

    // Decrement inventory for each variant
    for (const item of items) {
      const variant = variants.find((v) => v.id === item.variantId);
      if (variant?.inventory) {
        try {
          await prisma.inventory.update({
            where: { variantId: item.variantId },
            data: { quantity: { decrement: item.quantity } },
          });
        } catch (err) {
          console.error(`Failed to decrement inventory for variant ${item.variantId}:`, err);
        }
      }
    }

    // Update Customer totals
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders: { increment: 1 },
        totalSpent: { increment: total },
        lastOrderAt: new Date(),
        // Update name if missing
        firstName: customer.firstName || shippingAddress.firstName,
        lastName: customer.lastName || shippingAddress.lastName,
      },
    });

    // Update Discount usageCount
    if (discountRecord) {
      await prisma.discount.update({
        where: { id: discountRecord.id },
        data: { usageCount: { increment: 1 } },
      });
    }

    // Generate pre-auth magic link for "View Your Order" CTA (7 day expiry)
    let viewOrderUrl: string | undefined;
    try {
      const mlToken = crypto.randomBytes(32).toString("hex");
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
      await prisma.magicLinkToken.create({
        data: {
          token: mlToken,
          email,
          type: "CUSTOMER",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      viewOrderUrl = `${siteUrl}/api/auth/customer/verify?token=${encodeURIComponent(mlToken)}&redirect=${encodeURIComponent(`/account/orders/${order.orderNumber}`)}`;
    } catch (mlErr) {
      console.error("Failed to create magic link token for confirmation email:", mlErr);
    }

    // Send confirmation email
    const emailItems = items.map((item) => {
      const variant = variants.find((v) => v.id === item.variantId);
      const price = variant?.price ?? variant?.product.price ?? item.price;
      const productImage =
        item.image ||
        variant?.product.images?.[0]?.url ||
        null;
      return {
        title: item.name,
        variantTitle: item.variantName || undefined,
        quantity: item.quantity,
        price,
        total: price * item.quantity,
        image: productImage || undefined,
        addons: item.addons,
      };
    });

    try {
      const confirmResult = await resend.emails.send({
        from: `Artisans' Stories <hello@artisansstories.com>`,
        to: email,
        // replyTo uses order-specific address so replies auto-thread to this order in Communications
        replyTo: `hello@artisansstories.com`,
        headers: {
          // RFC 2822 threading: replies will carry this in In-Reply-To / References
          "X-Order-ID": order.id,
          "X-Order-Number": orderNumber,
        },
        subject: `Order Confirmed — ${orderNumber}`,
        html: orderConfirmationHtml({
          orderNumber,
          email,
          items: emailItems,
          subtotal,
          shippingTotal,
          taxTotal,
          discountTotal,
          total,
          shippingAddress,
          viewOrderUrl,
        }),
      });
      const confirmHtml = orderConfirmationHtml({ orderNumber, email, items: emailItems, subtotal, shippingTotal, taxTotal, discountTotal, total, shippingAddress, viewOrderUrl });
      await logEmail({ type: "ORDER_CONFIRMATION", toEmail: email, subject: `Order Confirmed — ${orderNumber}`, bodyHtml: confirmHtml, resendId: confirmResult.data?.id, relatedId: order.id, relatedType: "ORDER" });
    } catch (emailErr) {
      console.error("Failed to send confirmation email:", emailErr);
    }

    return NextResponse.json({
      orderNumber: order.orderNumber,
      orderId: order.id,
    });
  } catch (error) {
    console.error("checkout confirm error:", error);
    return NextResponse.json(
      { error: "Failed to confirm order" },
      { status: 500 }
    );
  }
}
