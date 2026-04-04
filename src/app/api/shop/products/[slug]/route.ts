import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const product = await prisma.product.findFirst({
      where: { slug, status: "ACTIVE" },
      include: {
        images: { orderBy: { position: "asc" } },
        variants: {
          orderBy: { position: "asc" },
          include: {
            inventory: true,
            images: { orderBy: { position: "asc" } },
          },
        },
        options: { orderBy: { position: "asc" } },
        categories: {
          include: {
            category: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Fetch related products from same category (first category)
    const firstCategoryId = product.categories[0]?.category?.id;
    let relatedProducts: typeof relatedRaw = [];
    const relatedRaw = await (firstCategoryId
      ? prisma.product.findMany({
          where: {
            status: "ACTIVE",
            id: { not: product.id },
            categories: { some: { categoryId: firstCategoryId } },
          },
          take: 4,
          select: {
            id: true,
            slug: true,
            name: true,
            price: true,
            compareAtPrice: true,
            isFeatured: true,
            images: {
              orderBy: { position: "asc" },
              take: 1,
              select: { url: true, urlMedium: true, altText: true },
            },
            variants: {
              select: { id: true, name: true },
              orderBy: { position: "asc" },
            },
          },
        })
      : Promise.resolve([]));

    relatedProducts = relatedRaw;

    return NextResponse.json({
      product: {
        ...product,
        categories: product.categories.map(pc => pc.category),
      },
      relatedProducts: relatedProducts.map(p => ({
        ...p,
        hasVariants: p.variants.length > 1,
        variantId: p.variants[0]?.id ?? null,
      })),
    });
  } catch (err) {
    console.error("[API /shop/products/[slug]]", err);
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
  }
}
