import { NextRequest, NextResponse } from "next/server";
import { resolveTenantFromHost } from "@/lib/tenant-context";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { prisma } from "@/lib/prisma";
import { createCheckoutSession, StripeConnectError, type ConnectTenant, type CheckoutLineItem } from "@/lib/stripe-connect";

/**
 * POST /api/store/checkout
 *
 * Internal checkout route for the white-label tenant storefront cart.
 * Called by the /cart page client-side — no API key required, auth is
 * tenant-from-host (the same origin-based resolution used by the storefront).
 *
 * Body: { items: [{variantId, quantity}][], successUrl, cancelUrl }
 * Returns: { url } — Stripe-hosted checkout URL to redirect to.
 */

interface CartItem {
  variantId: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await resolveTenantFromHost(req);
    const db = getTenantPrisma(tenantId);

    let body: { items?: CartItem[]; successUrl?: string; cancelUrl?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { items, successUrl, cancelUrl } = body;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
    }
    if (!successUrl || !cancelUrl) {
      return NextResponse.json({ error: "successUrl and cancelUrl are required" }, { status: 400 });
    }

    // Validate + price each item from DB (never trust client prices)
    const lineItems: Array<{
      variantId: string;
      productId: string;
      name: string;
      variantName: string;
      quantity: number;
      unitAmount: number;
      lineAmount: number;
    }> = [];
    for (const item of items) {
      if (!item?.variantId) {
        return NextResponse.json({ error: "each item requires a variantId" }, { status: 400 });
      }
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return NextResponse.json({ error: `invalid quantity for variant ${item.variantId}` }, { status: 400 });
      }

      const variant = await db.productVariant.findFirst({
        where: { id: item.variantId },
        include: { product: { select: { id: true, name: true, status: true, price: true } } },
      });

      if (!variant?.product) {
        return NextResponse.json({ error: `variant not found: ${item.variantId}` }, { status: 400 });
      }
      if (variant.product.status !== "ACTIVE") {
        return NextResponse.json({ error: `product is not available: ${variant.product.name}` }, { status: 400 });
      }

      const unitAmount = variant.price ?? variant.product.price;
      const lineAmount = unitAmount * quantity;

      lineItems.push({
        variantId: variant.id,
        productId: variant.product.id,
        name: variant.product.name,
        variantName: variant.name,
        quantity,
        unitAmount,
        lineAmount,
      });
    }

    // Load tenant Connect config
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        stripeConnectAccountId: true,
        stripeOnboarded: true,
        platformFeeBps: true,
        checkoutMode: true,
      },
    }) as ConnectTenant | null;

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    if (tenant.checkoutMode === "embedded") {
      return NextResponse.json({
        error: "This store uses embedded checkout — use the main checkout flow.",
        code: "checkout_mode_embedded",
      }, { status: 409 });
    }

    // Map internal line items to CheckoutLineItem shape
    const stripeLineItems: CheckoutLineItem[] = lineItems.map(li => ({
      name: li.variantName && li.variantName !== "Default"
        ? `${li.name} — ${li.variantName}`
        : li.name,
      unitAmount: li.unitAmount,
      quantity: li.quantity,
    }));

    // Create the Stripe Connect checkout session
    const result = await createCheckoutSession({
      tenant,
      lineItems: stripeLineItems,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({ ok: true, url: result.url, sessionId: result.id });

  } catch (err) {
    if (err instanceof StripeConnectError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/store/checkout]", err);
    return NextResponse.json({ error: "checkout_failed", message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
