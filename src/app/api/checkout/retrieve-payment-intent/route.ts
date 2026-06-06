import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require("stripe");
const stripe = new StripeSDK.default(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function GET(request: NextRequest) {
  try {
    const clientSecret = request.nextUrl.searchParams.get("clientSecret");
    if (!clientSecret) {
      return NextResponse.json({ error: "Missing clientSecret" }, { status: 400 });
    }

    // Extract payment intent ID from client secret (format: pi_xxx_secret_xxx)
    const paymentIntentId = clientSecret.split("_secret_")[0];
    if (!paymentIntentId?.startsWith("pi_")) {
      return NextResponse.json({ error: "Invalid clientSecret" }, { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const validStatuses = ["succeeded", "requires_capture"];

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      valid: validStatuses.includes(paymentIntent.status),
    });
  } catch (error) {
    console.error("retrieve-payment-intent error:", error);
    return NextResponse.json({ error: "Failed to retrieve payment intent" }, { status: 500 });
  }
}
