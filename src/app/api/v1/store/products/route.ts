import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  withApiKey,
  corsPreflight,
  jsonOk,
  SCOPE_STORE_READ,
  PRODUCT_CARD_SELECT,
  mapProductCard,
} from "@/lib/api-v1";

/**
 * GET /api/v1/store/products
 * Paginated, filterable list of ACTIVE products. Mirrors the response shape of
 * src/app/api/shop/products (products[], total, page, totalPages, categories[]).
 */
export async function GET(req: NextRequest) {
  return withApiKey(req, SCOPE_STORE_READ, async ({ db }) => {
    const { searchParams } = req.nextUrl;
    const categorySlug = searchParams.get("category");
    const q = searchParams.get("q")?.trim();
    const sort = searchParams.get("sort") ?? "featured";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(48, Math.max(1, parseInt(searchParams.get("limit") ?? "12", 10)));
    const minPrice = searchParams.get("minPrice") ? parseInt(searchParams.get("minPrice")!, 10) : undefined;
    const maxPrice = searchParams.get("maxPrice") ? parseInt(searchParams.get("maxPrice")!, 10) : undefined;
    const tagsParam = searchParams.get("tags") ?? searchParams.get("tag");
    const tags = tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : undefined;

    const skip = (page - 1) * limit;

    type WhereType = NonNullable<Parameters<typeof prisma.product.findMany>[0]>["where"];
    const where: WhereType = {
      status: "ACTIVE",
      ...(categorySlug && {
        categories: { some: { category: { slug: categorySlug, isActive: true } } },
      }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      }),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? {
            price: {
              ...(minPrice !== undefined ? { gte: minPrice } : {}),
              ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
            },
          }
        : {}),
      ...(tags && tags.length > 0 ? { tags: { hasSome: tags } } : {}),
    };

    type OrderByType = NonNullable<Parameters<typeof prisma.product.findMany>[0]>["orderBy"];
    let orderBy: OrderByType;
    switch (sort) {
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      case "price-asc":
        orderBy = { price: "asc" };
        break;
      case "price-desc":
        orderBy = { price: "desc" };
        break;
      case "best-selling":
        orderBy = { totalSold: "desc" };
        break;
      default:
        orderBy = [{ isFeatured: "desc" }, { createdAt: "desc" }];
    }

    const [products, total] = await Promise.all([
      db.product.findMany({ where, orderBy, skip, take: limit, select: PRODUCT_CARD_SELECT }),
      db.product.count({ where }),
    ]);

    const categories = await db.category.findMany({
      where: { isActive: true, parentId: null },
      select: { id: true, slug: true, name: true },
      orderBy: { position: "asc" },
    });

    return jsonOk({
      products: products.map(mapProductCard),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      categories,
    });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
