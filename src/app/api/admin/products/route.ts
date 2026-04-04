import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProductStatus, Prisma } from "@prisma/client";
function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
async function makeUniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}
export async function GET(request: NextRequest) {
  try {
    
    
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const categoryId = searchParams.get("categoryId") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const where: Prisma.ProductWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { artisanName: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status && Object.values(ProductStatus).includes(status as ProductStatus)) {
      where.status = status as ProductStatus;
    }
    if (categoryId) {
      where.categories = { some: { categoryId } };
    }
    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { slug: "asc" },
        include: {
          categories: {
            include: { category: { select: { id: true, name: true, slug: true } } },
          },
          images: {
            where: { isDefault: true },
            take: 1,
            select: { url: true, urlThumb: true, altText: true },
          },
          variants: {
            include: {
              inventory: { select: { quantity: true } },
            },
          },
        },
      }),
    ]);
    const productsWithStats = products.map((p) => {
      const totalInventory = p.variants.reduce(
        (acc, v) => acc + (v.inventory?.quantity ?? 0),
        0
      );
      const thumbnail = p.images[0] ?? null;
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        status: p.status,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        isFeatured: p.isFeatured,
        artisanName: p.artisanName,
        originCountry: p.originCountry,
        categories: p.categories.map((c) => c.category),
        thumbnail,
        variantCount: p.variants.length,
        totalInventory,
      };
    });
    return NextResponse.json({
      products: productsWithStats,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET /api/admin/products error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    
    
    const body = await request.json() as {
      name: string;
      description?: string;
      story?: string;
      price: number;
      compareAtPrice?: number;
      costPrice?: number;
      status?: ProductStatus;
      categoryIds?: string[];
      tags?: string[];
      artisanName?: string;
      originCountry?: string;
      materialsUsed?: string[];
      requiresShipping?: boolean;
      weight?: number;
      weightUnit?: string;
      length?: number;
      width?: number;
      height?: number;
      dimensionUnit?: string;
      seoTitle?: string;
      seoDescription?: string;
    };
    if (!body.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (body.price === undefined || body.price === null) {
      return NextResponse.json({ error: "Price is required" }, { status: 400 });
    }
    const baseSlug = generateSlug(body.name);
    const slug = await makeUniqueSlug(baseSlug);
    const product = await prisma.product.create({
      data: {
        name: body.name,
        slug,
        description: body.description,
        story: body.story,
        price: body.price,
        compareAtPrice: body.compareAtPrice,
        costPrice: body.costPrice,
        status: body.status ?? ProductStatus.DRAFT,
        tags: body.tags ?? [],
        artisanName: body.artisanName,
        originCountry: body.originCountry ?? "El Salvador",
        materialsUsed: body.materialsUsed ?? [],
        requiresShipping: body.requiresShipping ?? true,
        weight: body.weight,
        weightUnit: body.weightUnit ?? "oz",
        length: body.length,
        width: body.width,
        height: body.height,
        dimensionUnit: body.dimensionUnit ?? "in",
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        categories: body.categoryIds?.length
          ? {
              create: body.categoryIds.map((categoryId) => ({ categoryId })),
            }
          : undefined,
        variants: {
          create: [
            {
              name: "Default",
              optionValues: {},
              position: 0,
              inventory: {
                create: {
                  quantity: 0,
                  reservedQuantity: 0,
                  lowStockThreshold: 5,
                  trackedInventory: true,
                  allowBackorder: false,
                },
              },
            },
          ],
        },
      },
      include: {
        categories: { include: { category: true } },
        images: true,
        variants: { include: { inventory: true } },
        options: true,
      },
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/products error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
