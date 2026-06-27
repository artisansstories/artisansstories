import { NextRequest } from "next/server";
import {
  withApiKey,
  corsPreflight,
  jsonOk,
  SCOPE_STORE_READ,
  PRODUCT_CARD_SELECT,
  mapProductCard,
} from "@/lib/api-v1";

/**
 * GET /api/v1/store/products/featured
 * Up to `limit` featured ACTIVE products for tasteful interlaced placements.
 * Same card shape as the list endpoint's items.
 */
export async function GET(req: NextRequest) {
  return withApiKey(req, SCOPE_STORE_READ, async ({ db }) => {
    const limit = Math.min(12, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "4", 10)));

    const products = await db.product.findMany({
      where: { status: "ACTIVE", isFeatured: true },
      orderBy: [{ totalSold: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: PRODUCT_CARD_SELECT,
    });

    return jsonOk({ products: products.map(mapProductCard) });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
