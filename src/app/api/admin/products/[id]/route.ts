import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ProductStatus, ProductDiscountType, ProductPromoTheme } from "@prisma/client";
function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
// Slug uniqueness must be checked through the tenant-scoped client so the lookup
// only sees THIS tenant's rows (slugs are unique per-tenant, not globally).
async function makeUniqueSlug(db: TenantPrisma, base: string, excludeId: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await db.product.findFirst({
      where: { slug, NOT: { id: excludeId } },
    });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    const product = await db.product.findUnique({
      where: { id },
      include: {
        categories: { include: { category: true } },
        images: { orderBy: { position: "asc" } },
        variants: {
          orderBy: { position: "asc" },
          include: { inventory: true, images: true },
        },
        options: { orderBy: { position: "asc" } },
      },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (err) {
    console.error("GET /api/admin/products/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const body = await request.json() as {
      name?: string;
      description?: string;
      story?: string;
      price?: number;
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
      isFeatured?: boolean;
      disclaimer?: string | null;
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
      options?: Array<{
        id?: string;
        name: string;
        values: string[];
        position: number;
      }>;
      variants?: Array<{
        id?: string;
        name: string;
        sku?: string | null;
        price?: number | null;
        quantity?: number;
        optionValues: Record<string, string>;
        position: number;
      }>;
    };
    let slug = existing.slug;
    if (body.name && body.name !== existing.name) {
      const baseSlug = generateSlug(body.name);
      slug = await makeUniqueSlug(db, baseSlug, id);
    }
    const updateData: Parameters<typeof prisma.product.update>[0]["data"] = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (slug !== existing.slug) updateData.slug = slug;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.story !== undefined) updateData.story = body.story;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.compareAtPrice !== undefined) updateData.compareAtPrice = body.compareAtPrice;
    if (body.discountType !== undefined) updateData.discountType = body.discountType ?? null;
    if (body.promoLabel !== undefined) {
      const label = body.promoLabel || null;
      updateData.promoLabel = label;
      // When promoLabel is cleared, also clear promoTheme
      if (!label) updateData.promoTheme = null;
      else if (body.promoTheme !== undefined) updateData.promoTheme = body.promoTheme ?? ProductPromoTheme.WARM;
    } else if (body.promoTheme !== undefined) {
      updateData.promoTheme = body.promoTheme ?? null;
    }
    if (body.costPrice !== undefined) updateData.costPrice = body.costPrice;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.tags !== undefined) updateData.tags = body.tags;
    // artisanId handled via join table below; artisanName kept as denorm cache
    if (body.originCountry !== undefined) updateData.originCountry = body.originCountry;
    if (body.materialsUsed !== undefined) updateData.materialsUsed = body.materialsUsed;
    if (body.requiresShipping !== undefined) updateData.requiresShipping = body.requiresShipping;
    if (body.weight !== undefined) updateData.weight = body.weight;
    if (body.weightUnit !== undefined) updateData.weightUnit = body.weightUnit;
    if (body.length !== undefined) updateData.length = body.length;
    if (body.width !== undefined) updateData.width = body.width;
    if (body.height !== undefined) updateData.height = body.height;
    if (body.dimensionUnit !== undefined) updateData.dimensionUnit = body.dimensionUnit;
    if (body.sku !== undefined) updateData.sku = body.sku ?? null;
    if (body.seoTitle !== undefined) updateData.seoTitle = body.seoTitle;
    if (body.seoDescription !== undefined) updateData.seoDescription = body.seoDescription;
    if (body.isFeatured !== undefined) updateData.isFeatured = body.isFeatured;
    if (body.disclaimer !== undefined) updateData.disclaimer = body.disclaimer;
    if (body.showcaseImages !== undefined) updateData.showcaseImages = body.showcaseImages;
    // Update artisan link (ProductArtisan join table)
    if (body.artisanId !== undefined) {
      await db.productArtisan.deleteMany({ where: { productId: id } });
      if (body.artisanId) {
        await db.productArtisan.create({ data: { tenantId: db.$tenantId, productId: id, artisanId: body.artisanId } });
        // Backfill denormalized artisanName for backward compat
        const artisan = await db.artisan.findUnique({ where: { id: body.artisanId }, select: { name: true } });
        if (artisan) updateData.artisanName = artisan.name;
      } else {
        updateData.artisanName = null;
      }
    }

    // Update categories if provided
    if (body.categoryIds !== undefined) {
      updateData.categories = {
        deleteMany: {},
        create: body.categoryIds.map((categoryId) => ({ categoryId, tenantId: db.$tenantId })),
      };
    }
    // Update options if provided — delete all existing and re-insert
    if (body.options !== undefined) {
      await db.productOption.deleteMany({ where: { productId: id } });
      if (body.options.length > 0) {
        await db.productOption.createMany({
          data: body.options.map((o, i) => ({
            tenantId: db.$tenantId,
            productId: id,
            name: o.name,
            values: o.values,
            position: o.position ?? i,
          })),
        });
      }
    }

    // Update variants if provided — upsert by id, delete removed ones, create new ones
    if (body.variants !== undefined) {
      const incomingIds = body.variants.filter(v => v.id).map(v => v.id as string);
      // Delete variants not in incoming list
      await db.productVariant.deleteMany({
        where: { productId: id, id: { notIn: incomingIds } },
      });
      // Upsert each variant
      for (const v of body.variants) {
        if (v.id) {
          // Update existing
          await db.productVariant.update({
            where: { id: v.id },
            data: {
              name: v.name,
              sku: v.sku || null,
              price: v.price ?? null,
              optionValues: v.optionValues,
              position: v.position,
            },
          });
          // Update inventory quantity
          await db.inventory.upsert({
            where: { variantId: v.id },
            update: { quantity: v.quantity ?? 0 },
            create: { tenantId: db.$tenantId, variantId: v.id, quantity: v.quantity ?? 0, reservedQuantity: 0, allowBackorder: false, trackedInventory: true },
          });
        } else {
          // Create new variant
          const newVariant = await db.productVariant.create({
            data: {
              tenantId: db.$tenantId,
              productId: id,
              name: v.name,
              sku: v.sku || null,
              price: v.price ?? null,
              optionValues: v.optionValues,
              position: v.position,
            },
          });
          await db.inventory.create({
            data: { tenantId: db.$tenantId, variantId: newVariant.id, quantity: v.quantity ?? 0, reservedQuantity: 0, allowBackorder: false, trackedInventory: true },
          });
        }
      }
    }

    // Update images if provided — delete all existing and re-insert
    // Note: done AFTER variants so new variant IDs are available for variantId FK
    if (body.images !== undefined) {
      // Refresh variant list to get new IDs for any just-created variants
      const freshVariants = await db.productVariant.findMany({ where: { productId: id } });
      const resolvedImages = body.images.map((img, i) => ({
        tenantId: db.$tenantId,
        productId: id,
        url: img.url,
        urlMedium: img.urlMedium ?? null,
        urlThumb: img.urlThumb ?? null,
        altText: img.altText ?? null,
        position: img.position ?? i,
        isDefault: img.isDefault ?? i === 0,
        // If variantId is a valid existing variant ID, use it; otherwise null
        variantId: img.variantId && freshVariants.some(v => v.id === img.variantId) ? img.variantId : null,
      }));
      console.log('[PUT products] saving images with variantIds:', resolvedImages.map(img => img.variantId));
      await db.productImage.deleteMany({ where: { productId: id } });
      if (resolvedImages.length > 0) {
        await db.productImage.createMany({ data: resolvedImages });
      }
    }
    const product = await db.product.update({
      where: { id },
      data: updateData,
      include: {
        categories: { include: { category: true } },
        images: { orderBy: { position: "asc" } },
        variants: {
          orderBy: { position: "asc" },
          include: { inventory: true, images: true },
        },
        options: { orderBy: { position: "asc" } },
      },
    });
    return NextResponse.json({ product });
  } catch (err) {
    console.error("PUT /api/admin/products/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    await db.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/products/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
