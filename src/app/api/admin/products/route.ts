import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ProductStatus, ProductDiscountType, ProductPromoTheme, Prisma } from "@prisma/client";
function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
// Slug uniqueness must be checked through the tenant-scoped client so the lookup
// only sees THIS tenant's rows (slugs are unique per-tenant, not globally).
async function makeUniqueSlug(db: TenantPrisma, base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await db.product.findFirst({ where: { slug } });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

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
      db.product.count({ where }),
      db.product.findMany({
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
    const db = await getTenantPrismaForAdmin();

    const body = await request.json() as {
      name: string;
      description?: string;
      story?: string;
      price: number;
      compareAtPrice?: number;
      discountType?: ProductDiscountType | null;
      promoLabel?: string | null;
      promoTheme?: ProductPromoTheme | null;
      costPrice?: number;
      status?: ProductStatus;
      categoryIds?: string[];
      tags?: string[];
      artisanName?: string;
      artisanId?: string | null;
      originCountry?: string;
      materialsUsed?: string[];
      requiresShipping?: boolean;
      weight?: number;
      weightUnit?: string;
      length?: number;
      width?: number;
      height?: number;
      dimensionUnit?: string;
      sku?: string | null;
      seoTitle?: string;
      seoDescription?: string;
      showcaseImages?: string[];
      images?: Array<{
        url: string;
        urlMedium?: string | null;
        urlThumb?: string | null;
        altText?: string | null;
        position?: number;
        isDefault?: boolean;
        variantId?: string | null;
      }>;
    };
    if (!body.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (body.price === undefined || body.price === null) {
      return NextResponse.json({ error: "Price is required" }, { status: 400 });
    }
    const baseSlug = generateSlug(body.name);
    const slug = await makeUniqueSlug(db, baseSlug);
    const product = await db.product.create({
      data: {
        tenantId: db.$tenantId,
        name: body.name,
        slug,
        description: body.description,
        story: body.story,
        price: body.price,
        compareAtPrice: body.compareAtPrice,
        discountType: body.discountType ?? null,
        promoLabel: body.promoLabel || null,
        promoTheme: body.promoLabel ? (body.promoTheme ?? ProductPromoTheme.WARM) : null,
        costPrice: body.costPrice,
        status: body.status ?? ProductStatus.DRAFT,
        tags: body.tags ?? [],
        artisanName: body.artisanName, // kept for backward compat; overwritten below if artisanId provided
        originCountry: body.originCountry ?? "El Salvador",
        materialsUsed: body.materialsUsed ?? [],
        requiresShipping: body.requiresShipping ?? true,
        weight: body.weight,
        weightUnit: body.weightUnit ?? "oz",
        length: body.length,
        width: body.width,
        height: body.height,
        dimensionUnit: body.dimensionUnit ?? "in",
        sku: body.sku ?? null,
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        showcaseImages: body.showcaseImages ?? [],
        categories: body.categoryIds?.length
          ? {
              create: body.categoryIds.map((categoryId) => ({ categoryId, tenantId: db.$tenantId })),
            }
          : undefined,
        images: body.images?.length
          ? {
              create: body.images.map((img, i) => ({
                tenantId: db.$tenantId,
                url: img.url,
                urlMedium: img.urlMedium ?? null,
                urlThumb: img.urlThumb ?? null,
                altText: img.altText ?? null,
                position: img.position ?? i,
                isDefault: img.isDefault ?? i === 0,
                variantId: img.variantId ?? null,
              })),
            }
          : undefined,
        variants: {
          create: [
            {
              tenantId: db.$tenantId,
              name: "Default",
              optionValues: {},
              position: 0,
              inventory: {
                create: {
                  tenantId: db.$tenantId,
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
    // Link artisan via join table if provided
    if (body.artisanId) {
      await db.productArtisan.create({ data: { tenantId: db.$tenantId, productId: product.id, artisanId: body.artisanId } });
      const artisan = await db.artisan.findUnique({ where: { id: body.artisanId }, select: { name: true } });
      if (artisan) await db.product.update({ where: { id: product.id }, data: { artisanName: artisan.name } });
    }
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/products error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
