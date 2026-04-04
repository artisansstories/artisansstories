import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const categorySlug = searchParams.get("category");
    const sort = searchParams.get("sort") ?? "featured";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(48, Math.max(1, parseInt(searchParams.get("limit") ?? "12", 10)));
    const minPrice = searchParams.get("minPrice") ? parseInt(searchParams.get("minPrice")!, 10) : undefined;
    const maxPrice = searchParams.get("maxPrice") ? parseInt(searchParams.get("maxPrice")!, 10) : undefined;
    const tagsParam = searchParams.get("tags");
    const tags = tagsParam ? tagsParam.split(",").map(t => t.trim()).filter(Boolean) : undefined;

    const skip = (page - 1) * limit;

    // Build where clause
    type WhereType = NonNullable<Parameters<typeof prisma.product.findMany>[0]>["where"];
    const where: WhereType = {
      status: "ACTIVE",
      ...(categorySlug && {
        categories: {
          some: {
            category: { slug: categorySlug, isActive: true },
          },
        },
      }),
      ...(minPrice !== undefined || maxPrice !== undefined ? {
        price: {
          ...(minPrice !== undefined ? { gte: minPrice } : {}),
          ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
        },
      } : {}),
      ...(tags && tags.length > 0 ? { tags: { hasSome: tags } } : {}),
    };

    // Build orderBy
    type OrderByType = NonNullable<Parameters<typeof prisma.product.findMany>[0]>["orderBy"];
    let orderBy: OrderByType = { isFeatured: "desc" };
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
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          slug: true,
          name: true,
          price: true,
          compareAtPrice: true,
          isFeatured: true,
          totalSold: true,
          tags: true,
          images: {
            orderBy: { position: "asc" },
            take: 1,
            select: { url: true, urlMedium: true, altText: true },
          },
          categories: {
            select: {
              category: {
                select: { id: true, slug: true, name: true },
              },
            },
          },
          variants: {
            select: { id: true, name: true },
            orderBy: { position: "asc" },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Fetch categories for filter sidebar (active only)
    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null },
      select: { id: true, slug: true, name: true },
      orderBy: { position: "asc" },
    });

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      products: products.map(p => ({
        ...p,
        categories: p.categories.map(pc => pc.category),
        hasVariants: p.variants.length > 1,
        variantId: p.variants[0]?.id ?? null,
      })),
      total,
      page,
      totalPages,
      categories,
    });
  } catch (err) {
    console.error("[API /shop/products]", err);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
