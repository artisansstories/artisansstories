import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require("stripe");
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new StripeSDK(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" }) as any;

interface CheckoutItem {
  variantId: string;
  quantity: number;
  price: number; // client-provided, will be overridden by DB price
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
    const { items, email, shippingAddress, shippingRateId, discountCode } = body as {
      items: CheckoutItem[];
      email: string;
      shippingAddress: ShippingAddress;
      shippingRateId: string;
      discountCode?: string;
    };

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!shippingAddress?.firstName || !shippingAddress?.lastName || !shippingAddress?.address1 ||
        !shippingAddress?.city || !shippingAddress?.state || !shippingAddress?.zip ||
        !shippingAddress?.country) {
      return NextResponse.json({ error: "Complete shipping address is required" }, { status: 400 });
    }
    if (!shippingRateId) {
      return NextResponse.json({ error: "Shipping rate is required" }, { status: 400 });
    }

    // Fetch variants from DB to get current prices
    const variantIds = items.map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    if (variants.length !== variantIds.length) {
      return NextResponse.json({ error: "One or more items not found" }, { status: 400 });
    }

    // Calculate subtotal from DB prices
    let subtotal = 0;
    for (const item of items) {
      const variant = variants.find((v) => v.id === item.variantId);
      if (!variant) {
        return NextResponse.json({ error: `Variant ${item.variantId} not found` }, { status: 400 });
      }
      const price = variant.price ?? variant.product.price;
      subtotal += price * item.quantity;
    }

    // Fetch shipping rate from DB
    const shippingRate = await prisma.shippingRate.findUnique({
      where: { id: shippingRateId, isActive: true },
    });
    if (!shippingRate) {
      return NextResponse.json({ error: "Shipping rate not found" }, { status: 400 });
    }
    const shippingTotal = shippingRate.price;

    // Apply discount if provided
    let discountTotal = 0;
    let validatedDiscountCode: string | undefined;
    // Track taxable amounts separately for correct Stripe Tax line items
    let taxableGoods = subtotal;
    let taxableShipping = shippingTotal;

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
            taxableGoods = subtotal - discountTotal;
          } else if (discount.type === "FIXED_AMOUNT") {
            discountTotal = Math.min(discount.value, subtotal);
            taxableGoods = subtotal - discountTotal;
          } else if (discount.type === "FREE_SHIPPING") {
            discountTotal = shippingTotal;
            taxableShipping = 0;
            // taxableGoods stays = subtotal (no discount on goods)
          }
          validatedDiscountCode = discountCode.toUpperCase();
        }
      }
    }

    // Calculate tax via Stripe Tax (automatic, address-based)
    let taxTotal = 0;
    let taxCalculationId = "";
    try {
      const taxLineItems = [
        {
          amount: Math.max(0, taxableGoods),
          reference: "goods",
          tax_code: "txcd_99999999", // General tangible goods
          tax_behavior: "exclusive",
        },
        ...(taxableShipping > 0
          ? [{
              amount: taxableShipping,
              reference: "shipping",
              tax_code: "txcd_92010001", // Shipping
              tax_behavior: "exclusive",
            }]
          : []),
      ];

      const taxCalculation = await stripe.tax.calculations.create({
        currency: "usd",
        customer_details: {
          address: {
            line1: shippingAddress.address1,
            line2: shippingAddress.address2 || "",
            city: shippingAddress.city,
            state: shippingAddress.stateCode,
            postal_code: shippingAddress.zip,
            country: shippingAddress.countryCode || "US",
          },
          address_source: "shipping",
        },
        line_items: taxLineItems,
      });

      taxTotal = taxCalculation.tax_amount_exclusive;
      taxCalculationId = taxCalculation.id;
    } catch (taxErr) {
      console.error("Stripe Tax calculation failed, proceeding with 0% tax:", taxErr);
      taxTotal = 0;
      taxCalculationId = "";
    }

    // Calculate total
    const total = Math.max(0, subtotal - discountTotal + shippingTotal + taxTotal);

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        email,
        discountCode: validatedDiscountCode || "",
        shippingRateId,
        taxCalculationId,
        taxTotal: String(taxTotal),
      },
      receipt_email: email,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      subtotal,
      discountTotal,
      shippingTotal,
      taxTotal,
      total,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("create-payment-intent error:", error);
    return NextResponse.json(
      { error: "Failed to create payment intent" },
      { status: 500 }
    );
  }
}
