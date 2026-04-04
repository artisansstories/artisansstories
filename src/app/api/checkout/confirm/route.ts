import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require("stripe");
import { prisma } from "@/lib/prisma";
import { orderConfirmationHtml } from "@/lib/emails/order-confirmation";
import { Resend } from "resend";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new StripeSDK(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" }) as any;

const resend = new Resend(process.env.RESEND_API_KEY);

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

    // Verify the PaymentIntent exists and has status 'succeeded'
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: `Payment not completed. Status: ${paymentIntent.status}` },
        { status: 400 }
      );
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
    const taxTotal = parseInt(paymentIntent.metadata?.taxTotal || "0", 10);
    const taxCalculationId: string = paymentIntent.metadata?.taxCalculationId || "";

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
          financialStatus: "PAID",
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
                },
              };
            }),
          },
        },
        include: { items: true },
      });

      return newOrder;
    });

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
      };
    });

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM!,
        to: email,
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
        }),
      });
    } catch (emailErr) {
      console.error("Failed to send confirmation email:", emailErr);
      // Don't fail the order if email fails
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
