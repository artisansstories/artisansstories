import { NextRequest } from "next/server";
import { withApiKey, corsPreflight, jsonOk, SCOPE_CHECKOUT_CREATE } from "@/lib/api-v1";

interface CheckoutItem {
  variantId: string;
  quantity: number;
  addons?: unknown;
}

/**
 * POST /api/v1/store/checkout/session
 * P3 STUB: performs full tenant-scoped validation + DB-priced amount
 * computation, then returns a stub session. P4 swaps in the Stripe Connect
 * session create — the validation/pricing here is the contract it builds on.
 *
 * Requires scope `checkout:create`. Never trusts client-supplied prices.
 */
export async function POST(req: NextRequest) {
  return withApiKey(req, SCOPE_CHECKOUT_CREATE, async ({ db }) => {
    let body: { items?: CheckoutItem[]; successUrl?: string; cancelUrl?: string; customerEmail?: string };
    try {
      body = await req.json();
    } catch {
      return jsonOk({ error: "Invalid JSON body" }, 400);
    }

    const items = body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return jsonOk({ error: "items must be a non-empty array" }, 400);
    }
    if (!body.successUrl || !body.cancelUrl) {
      return jsonOk({ error: "successUrl and cancelUrl are required" }, 400);
    }

    const lineItems: Array<{
      variantId: string;
      productId: string;
      name: string;
      variantName: string;
      quantity: number;
      unitAmount: number;
      lineAmount: number;
    }> = [];
    let amountSubtotal = 0;

    for (const item of items) {
      if (!item || typeof item.variantId !== "string") {
        return jsonOk({ error: "each item requires a variantId" }, 400);
      }
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return jsonOk({ error: `invalid quantity for variant ${item.variantId}` }, 400);
      }

      // Scoped lookup — a variant from another tenant simply won't be found.
      const variant = await db.productVariant.findFirst({
        where: { id: item.variantId },
        include: { product: { select: { id: true, name: true, status: true, price: true } } },
      });

      if (!variant || !variant.product) {
        return jsonOk({ error: `variant not found: ${item.variantId}` }, 400);
      }
      if (variant.product.status !== "ACTIVE") {
        return jsonOk({ error: `product is not active for variant ${item.variantId}` }, 400);
      }

      // Price comes from the DB only: variant override, else product base price.
      const unitAmount = variant.price ?? variant.product.price;
      const lineAmount = unitAmount * quantity;
      amountSubtotal += lineAmount;

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

    return jsonOk({
      ok: true,
      mode: "stub",
      amountSubtotal,
      currency: "usd",
      customerEmail: body.customerEmail ?? null,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      lineItems,
      note: "Stripe Connect wired in P4",
    });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
