import { NextRequest } from "next/server";
import { withApiKey, corsPreflight, jsonOk, SCOPE_STORE_READ } from "@/lib/api-v1";

/**
 * GET /api/v1/store/products/[slug]
 * Full product detail by slug (tenant-scoped). Variant availability is exposed
 * as a boolean (`available`), never as raw inventory counts. 404 if not found.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return withApiKey(req, SCOPE_STORE_READ, async ({ db }) => {
    const { slug } = await params;

    const product = await db.product.findFirst({
      where: { slug, status: "ACTIVE" },
      include: {
        images: { orderBy: { position: "asc" } },
        options: { orderBy: { position: "asc" } },
        variants: {
          orderBy: { position: "asc" },
          include: { inventory: true },
        },
        categories: {
          include: { category: { select: { id: true, slug: true, name: true } } },
        },
        artisans: {
          include: {
            artisan: { select: { id: true, slug: true, name: true, status: true, avatarUrl: true } },
          },
        },
        addons: {
          where: { isEnabled: true },
          select: { id: true, type: true, config: true },
        },
      },
    });

    if (!product) {
      return jsonOk({ error: "Product not found" }, 404);
    }

    // Approved-review summary (avg rating + count), scoped to this product.
    const reviewAgg = await db.review.aggregate({
      where: { productId: product.id, status: "APPROVED" },
      _avg: { rating: true },
      _count: { _all: true },
    });

    const variants = product.variants.map((v) => {
      const inv = v.inventory;
      // Available unless inventory is tracked AND on-hand (minus reserved) <= 0
      // and backorders are disallowed. No raw counts leave the API.
      const available = !inv
        ? true
        : !inv.trackedInventory
          ? true
          : inv.allowBackorder
            ? true
            : inv.quantity - inv.reservedQuantity > 0;
      return {
        id: v.id,
        name: v.name,
        sku: v.sku,
        price: v.price,
        optionValues: v.optionValues,
        position: v.position,
        available,
      };
    });

    return jsonOk({
      product: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        story: product.story,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        discountType: product.discountType,
        promoLabel: product.promoLabel,
        promoTheme: product.promoTheme,
        tags: product.tags,
        isFeatured: product.isFeatured,
        materialsUsed: product.materialsUsed,
        disclaimer: product.disclaimer,
        images: product.images.map((img) => ({
          id: img.id,
          url: img.url,
          urlThumb: img.urlThumb,
          urlMedium: img.urlMedium,
          altText: img.altText,
          position: img.position,
          variantId: img.variantId,
        })),
        options: product.options.map((o) => ({
          id: o.id,
          name: o.name,
          values: o.values,
          position: o.position,
        })),
        variants,
        categories: product.categories.map((pc) => pc.category),
        addons: product.addons,
        artisans: product.artisans.map((pa) => pa.artisan),
        reviews: {
          average: reviewAgg._avg.rating ?? 0,
          count: reviewAgg._count._all,
        },
      },
    });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
