/**
 * admin-services/products.ts — product logic shared by /api/admin/products/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). The only
 * additions are read-only `preview*` functions used by MCP write tools.
 */
import { ProductStatus, ProductDiscountType, ProductPromoTheme, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { generateProductSKU, generateVariantSKU } from "@/lib/sku";
import { ok, fail, type ServiceResult } from "./result";
import { fallbackAltText } from "./uploads";

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
// Slug uniqueness must be checked through the tenant-scoped client so the lookup
// only sees THIS tenant's rows (slugs are unique per-tenant, not globally).
async function makeUniqueSlug(db: TenantPrisma, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await db.product.findFirst({
      where: excludeId ? { slug, NOT: { id: excludeId } } : { slug },
    });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// ── list / get ──────────────────────────────────────────────────────────────

export interface ProductListParams {
  search?: string;
  status?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
}

export async function listProducts(db: TenantPrisma, p: ProductListParams) {
  const search = p.search ?? "";
  const status = p.status ?? "";
  const categoryId = p.categoryId ?? "";
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(100, Math.max(1, p.limit ?? 20));
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
  return ok({
    products: productsWithStats,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

const PRODUCT_DETAIL_INCLUDE = {
  categories: { include: { category: true } },
  images: { orderBy: { position: "asc" } },
  variants: {
    orderBy: { position: "asc" },
    include: { inventory: true, images: true },
  },
  options: { orderBy: { position: "asc" } },
} satisfies Prisma.ProductInclude;

export async function getProduct(db: TenantPrisma, id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: PRODUCT_DETAIL_INCLUDE,
  });
  if (!product) {
    return fail(404, "Product not found");
  }
  return ok({ product });
}

// ── create ──────────────────────────────────────────────────────────────────

export interface ProductImageInput {
  url: string;
  urlMedium?: string | null;
  urlThumb?: string | null;
  altText?: string | null;
  position?: number;
  isDefault?: boolean;
  variantId?: string | null;
}

export interface ProductCreateBody {
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
  images?: ProductImageInput[];
}

function createGuard(body: ProductCreateBody): ServiceResult<null> {
  if (!body.name) {
    return fail(400, "Name is required");
  }
  if (body.price === undefined || body.price === null) {
    return fail(400, "Price is required");
  }
  return ok(null);
}

export async function createProduct(db: TenantPrisma, body: ProductCreateBody) {
  const g = createGuard(body);
  if (!g.ok) return g;
  // Categories and artisan must exist in THIS store (the FK alone would accept
  // another tenant's id, and a missing id surfaced as a 500).
  const refs = await referenceGuard(db, body);
  if (!refs.ok) return refs;
  const baseSlug = generateSlug(body.name);
  const slug = await makeUniqueSlug(db, baseSlug);
  // The artisan link (join row + denormalized name) is part of the same create,
  // so a bad artisanId leaves no half-created product behind.
  const artisan = body.artisanId ? { id: body.artisanId, name: refs.data.artisanName } : null;
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
      artisanName: artisan?.name ?? body.artisanName, // denormalized cache of the linked artisan
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
      artisans: artisan ? { create: [{ tenantId: db.$tenantId, artisanId: artisan.id }] } : undefined,
      images: body.images?.length
        ? {
            create: body.images.map((img, i) => ({
              tenantId: db.$tenantId,
              url: img.url,
              urlMedium: img.urlMedium ?? null,
              urlThumb: img.urlThumb ?? null,
              altText: img.altText?.trim() || fallbackAltText(body.name, (img.position ?? i) + 1),
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
  }).catch((err: unknown) => {
    if (isUniqueViolation(err)) return null;
    throw err;
  });
  if (!product) return fail(409, "SKU is already used by another product in this store");
  return ok({ product }, 201);
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

/** Read-only checks for references the route would otherwise hit as a mid-write FK error. */
async function referenceGuard(
  db: TenantPrisma,
  refs: { categoryIds?: string[]; artisanId?: string | null }
): Promise<ServiceResult<{ categories: { id: string; name: string }[]; artisanName: string | null }>> {
  let categories: { id: string; name: string }[] = [];
  if (refs.categoryIds?.length) {
    categories = await db.category.findMany({
      where: { id: { in: refs.categoryIds } },
      select: { id: true, name: true },
    });
    const missing = refs.categoryIds.filter((cid) => !categories.some((c) => c.id === cid));
    if (missing.length) return fail(404, `Category not found: ${missing.join(", ")}`);
  }
  let artisanName: string | null = null;
  if (refs.artisanId) {
    const artisan = await db.artisan.findUnique({ where: { id: refs.artisanId }, select: { name: true } });
    if (!artisan) return fail(404, `Artisan not found: ${refs.artisanId}`);
    artisanName = artisan.name;
  }
  return ok({ categories, artisanName });
}

export async function previewCreateProduct(db: TenantPrisma, body: ProductCreateBody) {
  const g = createGuard(body);
  if (!g.ok) return g;
  const refs = await referenceGuard(db, body);
  if (!refs.ok) return refs;
  const slug = await makeUniqueSlug(db, generateSlug(body.name));
  const status = body.status ?? ProductStatus.DRAFT;
  return ok({
    action: "create product",
    name: body.name,
    slug,
    status,
    publishesOnStorefront: status === ProductStatus.ACTIVE,
    note:
      status === ProductStatus.ACTIVE
        ? "Status ACTIVE: the product is published and visible/purchasable on the storefront immediately."
        : `Status ${status}: the product is not visible on the storefront.`,
    price: body.price,
    compareAtPrice: body.compareAtPrice ?? null,
    costPrice: body.costPrice ?? null,
    sku: body.sku ?? null,
    promoLabel: body.promoLabel || null,
    promoTheme: body.promoLabel ? (body.promoTheme ?? ProductPromoTheme.WARM) : null,
    discountType: body.discountType ?? null,
    artisan: body.artisanId ? { id: body.artisanId, name: refs.data.artisanName } : body.artisanName ?? null,
    categories: refs.data.categories,
    images: body.images?.length ?? 0,
    tags: body.tags ?? [],
    creates: "1 product with a single 'Default' variant (inventory quantity 0)",
  });
}

// ── update ──────────────────────────────────────────────────────────────────

export interface ProductUpdateBody {
  name?: string;
  description?: string | null;
  story?: string | null;
  price?: number;
  compareAtPrice?: number | null;
  discountType?: ProductDiscountType | null;
  promoLabel?: string | null;
  promoTheme?: ProductPromoTheme | null;
  costPrice?: number | null;
  status?: ProductStatus;
  categoryIds?: string[];
  tags?: string[];
  artisanName?: string;
  artisanId?: string | null;
  originCountry?: string;
  materialsUsed?: string[];
  requiresShipping?: boolean;
  weight?: number | null;
  weightUnit?: string;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  dimensionUnit?: string;
  sku?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isFeatured?: boolean;
  disclaimer?: string | null;
  showcaseImages?: string[];
  images?: ProductImageInput[];
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
}

type ProductUpdateData = Parameters<typeof prisma.product.update>[0]["data"];

/** Scalar part of the PUT update data (pure; artisan/categories handled separately). */
function scalarUpdateData(body: ProductUpdateBody, existingSlug: string, slug: string): ProductUpdateData {
  const updateData: ProductUpdateData = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (slug !== existingSlug) updateData.slug = slug;
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
  return updateData;
}

async function resolveSlug(db: TenantPrisma, id: string, existing: { name: string; slug: string }, body: ProductUpdateBody) {
  let slug = existing.slug;
  if (body.name && body.name !== existing.name) {
    const baseSlug = generateSlug(body.name);
    slug = await makeUniqueSlug(db, baseSlug, id);
  }
  return slug;
}

export async function updateProduct(db: TenantPrisma, id: string, body: ProductUpdateBody) {
  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) {
    return fail(404, "Product not found");
  }
  // Same reference checks as the preview: categories/artisan must exist in THIS
  // store. The FK alone accepted another tenant's category or artisan id.
  const refs = await referenceGuard(db, body);
  if (!refs.ok) return refs;
  const slug = await resolveSlug(db, id, existing, body);
  const updateData = scalarUpdateData(body, existing.slug, slug);
  const tenantId = db.$tenantId;
  const existingName = existing.name;

  // Every write below (artisan link, options, variants + inventory, images,
  // product row) commits together or not at all. A failure halfway used to
  // leave e.g. variants replaced but images gone.
  const product = await db.$transaction(async (tx) => {
    // Update artisan link (ProductArtisan join table)
    if (body.artisanId !== undefined) {
      await tx.productArtisan.deleteMany({ where: { productId: id } });
      if (body.artisanId) {
        await tx.productArtisan.create({ data: { tenantId, productId: id, artisanId: body.artisanId } });
        // Backfill denormalized artisanName for backward compat
        updateData.artisanName = refs.data.artisanName;
      } else {
        updateData.artisanName = null;
      }
    }

    // Update categories if provided
    if (body.categoryIds !== undefined) {
      updateData.categories = {
        deleteMany: {},
        create: body.categoryIds.map((categoryId) => ({ categoryId, tenantId })),
      };
    }
    // Update options if provided — delete all existing and re-insert
    if (body.options !== undefined) {
      await tx.productOption.deleteMany({ where: { productId: id } });
      if (body.options.length > 0) {
        await tx.productOption.createMany({
          data: body.options.map((o, i) => ({
            tenantId,
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
      await tx.productVariant.deleteMany({
        where: { productId: id, id: { notIn: incomingIds } },
      });
      // Upsert each variant
      for (const v of body.variants) {
        if (v.id) {
          // Update existing (scoped to this product, so another product's variant id is refused)
          const { count } = await tx.productVariant.updateMany({
            where: { id: v.id, productId: id },
            data: {
              name: v.name,
              sku: v.sku || null,
              price: v.price ?? null,
              optionValues: v.optionValues,
              position: v.position,
            },
          });
          if (count === 0) throw new ProductUpdateError(400, `Variant ${v.id} does not belong to this product`);
          // Update inventory quantity
          await tx.inventory.upsert({
            where: { variantId: v.id },
            update: { quantity: v.quantity ?? 0 },
            create: { tenantId, variantId: v.id, quantity: v.quantity ?? 0, reservedQuantity: 0, allowBackorder: false, trackedInventory: true },
          });
        } else {
          // Create new variant
          const newVariant = await tx.productVariant.create({
            data: {
              tenantId,
              productId: id,
              name: v.name,
              sku: v.sku || null,
              price: v.price ?? null,
              optionValues: v.optionValues,
              position: v.position,
            },
          });
          await tx.inventory.create({
            data: { tenantId, variantId: newVariant.id, quantity: v.quantity ?? 0, reservedQuantity: 0, allowBackorder: false, trackedInventory: true },
          });
        }
      }
    }

    // Update images if provided — delete all existing and re-insert
    // Note: done AFTER variants so new variant IDs are available for variantId FK
    if (body.images !== undefined) {
      // Refresh variant list to get new IDs for any just-created variants
      const freshVariants = await tx.productVariant.findMany({ where: { productId: id } });
      const resolvedImages = body.images.map((img, i) => ({
        tenantId,
        productId: id,
        url: img.url,
        urlMedium: img.urlMedium ?? null,
        urlThumb: img.urlThumb ?? null,
        altText: img.altText?.trim() || fallbackAltText(body.name ?? existingName, (img.position ?? i) + 1),
        position: img.position ?? i,
        isDefault: img.isDefault ?? i === 0,
        // If variantId is a valid existing variant ID, use it; otherwise null
        variantId: img.variantId && freshVariants.some(v => v.id === img.variantId) ? img.variantId : null,
      }));
      await tx.productImage.deleteMany({ where: { productId: id } });
      if (resolvedImages.length > 0) {
        await tx.productImage.createMany({ data: resolvedImages });
      }
    }
    return tx.product.update({
      where: { id },
      data: updateData,
      include: PRODUCT_DETAIL_INCLUDE,
    });
  }).catch((err: unknown) => {
    if (err instanceof ProductUpdateError) return err;
    // Unknown category/artisan id → FK violation; nothing was written.
    if ((err as { code?: string })?.code === "P2003") return new ProductUpdateError(400, "A referenced category, artisan or variant does not exist");
    // Duplicate product/variant SKU (unique per store); the transaction rolled back.
    if (isUniqueViolation(err)) return new ProductUpdateError(409, "SKU is already used by another product or variant in this store");
    throw err;
  });
  if (product instanceof ProductUpdateError) return fail(product.status, product.message);
  return ok({ product });
}

/** A validation failure raised inside the update transaction (rolls it back). */
class ProductUpdateError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export async function previewUpdateProduct(db: TenantPrisma, id: string, body: ProductUpdateBody) {
  const existing = await db.product.findUnique({
    where: { id },
    include: {
      categories: { include: { category: { select: { id: true, name: true } } } },
      artisans: { include: { artisan: { select: { id: true, name: true } } } },
      images: { orderBy: { position: "asc" }, select: { url: true, isDefault: true, variantId: true } },
      options: { orderBy: { position: "asc" }, select: { name: true, values: true } },
      variants: {
        orderBy: { position: "asc" },
        include: { inventory: { select: { quantity: true } }, _count: { select: { orderItems: true } } },
      },
    },
  });
  if (!existing) {
    return fail(404, "Product not found");
  }
  const refs = await referenceGuard(db, body);
  if (!refs.ok) return refs;
  // Variant ids must belong to THIS product; the route would otherwise fail mid-write
  // (unknown id) or edit another product's variant.
  if (body.variants) {
    const foreign = body.variants
      .filter((v) => v.id && !existing.variants.some((ev) => ev.id === v.id))
      .map((v) => v.id as string);
    if (foreign.length) return fail(400, `Variant id(s) not found on this product: ${foreign.join(", ")}`);
  }

  const slug = await resolveSlug(db, id, existing, body);
  const data = scalarUpdateData(body, existing.slug, slug) as Record<string, unknown>;
  if (body.artisanId !== undefined) {
    data.artisanName = body.artisanId ? refs.data.artisanName ?? existing.artisanName : null;
  }
  const current = existing as unknown as Record<string, unknown>;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(data)) {
    if (!same(current[k], to)) changes[k] = { from: current[k] ?? null, to: to ?? null };
  }

  const publishes = changes.status?.to === ProductStatus.ACTIVE;
  const unpublishes = existing.status === ProductStatus.ACTIVE && changes.status !== undefined && !publishes;

  const out: Record<string, unknown> = {
    product: { id: existing.id, name: existing.name, slug: existing.slug, status: existing.status },
    changes,
    publishesOnStorefront: publishes,
  };
  if (publishes) out.note = "Status becomes ACTIVE: the product is published and visible/purchasable on the storefront.";
  else if (unpublishes) out.note = `Status becomes ${String(changes.status!.to)}: the product is removed from the storefront.`;
  else if (existing.status === ProductStatus.ACTIVE) out.note = "This product is live (ACTIVE); changes show on the storefront immediately.";

  if (body.artisanId !== undefined) {
    out.artisan = {
      from: existing.artisans.map((a) => a.artisan),
      to: body.artisanId ? [{ id: body.artisanId, name: refs.data.artisanName }] : [],
    };
  }
  if (body.categoryIds !== undefined) {
    out.categories = {
      from: existing.categories.map((c) => c.category),
      to: refs.data.categories,
    };
  }
  if (body.options !== undefined) {
    out.options = {
      replacesAll: true,
      from: existing.options,
      to: body.options.map((o) => ({ name: o.name, values: o.values })),
    };
  }
  if (body.variants !== undefined) {
    const incoming = new Set(body.variants.filter((v) => v.id).map((v) => v.id as string));
    const deleted = existing.variants
      .filter((v) => !incoming.has(v.id))
      .map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        quantity: v.inventory?.quantity ?? 0,
        orderItemReferences: v._count.orderItems,
      }));
    const updated = body.variants
      .filter((v) => v.id)
      .map((v) => {
        const ev = existing.variants.find((x) => x.id === v.id)!;
        const next = { name: v.name, sku: v.sku || null, price: v.price ?? null, optionValues: v.optionValues, position: v.position };
        const vc: Record<string, { from: unknown; to: unknown }> = {};
        for (const [k, to] of Object.entries(next)) {
          const from = (ev as unknown as Record<string, unknown>)[k];
          if (!same(from, to)) vc[k] = { from: from ?? null, to };
        }
        const fromQty = ev.inventory?.quantity ?? null;
        const toQty = v.quantity ?? 0;
        if (fromQty !== toQty) vc.inventoryQuantity = { from: fromQty, to: toQty };
        return { id: ev.id, name: ev.name, changes: vc };
      })
      .filter((v) => Object.keys(v.changes).length > 0);
    const created = body.variants
      .filter((v) => !v.id)
      .map((v) => ({ name: v.name, sku: v.sku || null, price: v.price ?? null, quantity: v.quantity ?? 0 }));
    out.variants = {
      deleted,
      updated,
      created,
      ...(deleted.some((d) => d.orderItemReferences > 0)
        ? { orderItemNote: "Past order line items that reference deleted variants keep their record but lose the variant link." }
        : {}),
      ...(body.variants.length === 0 ? { warning: "An empty variants list deletes every variant of this product." } : {}),
    };
  }
  if (body.images !== undefined) {
    out.images = {
      replacesAll: true,
      from: existing.images.length,
      to: body.images.length,
      removedUrls: existing.images.map((i) => i.url).filter((u) => !body.images!.some((n) => n.url === u)),
      addedUrls: body.images.map((i) => i.url).filter((u) => !existing.images.some((e) => e.url === u)),
    };
  }
  return ok(out);
}

// ── delete ──────────────────────────────────────────────────────────────────

export async function deleteProduct(db: TenantPrisma, id: string) {
  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) {
    return fail(404, "Product not found");
  }
  await db.product.delete({ where: { id } });
  return ok({ success: true });
}

export async function previewDeleteProduct(db: TenantPrisma, id: string) {
  const existing = await db.product.findUnique({
    where: { id },
    include: {
      variants: { select: { id: true, name: true, sku: true, inventory: { select: { quantity: true } } } },
      _count: {
        select: {
          images: true,
          options: true,
          categories: true,
          artisans: true,
          reviews: true,
          addons: true,
          orderItems: true,
        },
      },
    },
  });
  if (!existing) {
    return fail(404, "Product not found");
  }
  const c = existing._count;
  return ok({
    product: { id: existing.id, name: existing.name, slug: existing.slug, sku: existing.sku, status: existing.status },
    wasLiveOnStorefront: existing.status === ProductStatus.ACTIVE,
    permanentlyDeletes: {
      variants: existing.variants.map((v) => ({ ...v, inventory: v.inventory?.quantity ?? null })),
      inventoryRecords: existing.variants.filter((v) => v.inventory).length,
      images: c.images,
      options: c.options,
      categoryLinks: c.categories,
      artisanLinks: c.artisans,
      reviews: c.reviews,
      addons: c.addons,
    },
    orderItemReferences: c.orderItems,
    ...(c.orderItems > 0
      ? { orderItemNote: "Past order line items keep their title/price snapshot but lose the link to this product." }
      : {}),
    alternative: "Setting status to ARCHIVED hides the product without deleting it.",
  });
}

// ── addons ──────────────────────────────────────────────────────────────────

const DEFAULT_MONOGRAM_CONFIG = {
  fonts: ["Anonymous Pro", "Happy Monkey", "Oregano"],
  maxChars: 50,
  styles: ["INITIALS", "FULL_NAME"],
};

export async function getProductAddons(db: TenantPrisma, id: string) {
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) {
    return fail(404, "Product not found");
  }
  const addons = await db.productAddon.findMany({
    where: { productId: id },
    orderBy: { sortOrder: "asc" },
  });
  return ok({ addons });
}

async function addonGuard(db: TenantPrisma, id: string, type: string, isEnabled: boolean) {
  if (!type || typeof isEnabled !== "boolean") {
    return fail(400, "type and isEnabled are required");
  }

  if (type !== "LASER_MONOGRAM") {
    return fail(400, "Invalid addon type");
  }

  // Verify product exists
  const product = await db.product.findUnique({ where: { id } });
  if (!product) {
    return fail(404, "Product not found");
  }
  return ok(product);
}

export async function setProductAddon(db: TenantPrisma, id: string, type: string, isEnabled: boolean) {
  const g = await addonGuard(db, id, type, isEnabled);
  if (!g.ok) return g;

  // Upsert the addon
  const addon = await db.productAddon.upsert({
    where: { productId_type: { productId: id, type: "LASER_MONOGRAM" } },
    create: {
      tenantId: db.$tenantId,
      productId: id,
      type: "LASER_MONOGRAM",
      isEnabled,
      config: DEFAULT_MONOGRAM_CONFIG,
    },
    update: { isEnabled },
  });

  return ok({ addon });
}

export async function previewSetProductAddon(db: TenantPrisma, id: string, type: string, isEnabled: boolean) {
  const g = await addonGuard(db, id, type, isEnabled);
  if (!g.ok) return g;
  const current = await db.productAddon.findFirst({
    where: { productId: id, type: "LASER_MONOGRAM" },
  });
  return ok({
    product: { id: g.data.id, name: g.data.name, status: g.data.status },
    addon: "LASER_MONOGRAM",
    exists: !!current,
    isEnabled: { from: current?.isEnabled ?? null, to: isEnabled },
    ...(current ? {} : { createsWithConfig: DEFAULT_MONOGRAM_CONFIG }),
  });
}

// ── generate SKU (read-only) ────────────────────────────────────────────────

export interface GenerateSkuBody {
  type: string;
  categoryName?: string | null;
  productSku?: string;
  optionValues?: string[];
}

export async function generateSku(db: TenantPrisma, body: GenerateSkuBody) {
  const { type, categoryName, productSku, optionValues } = body;

  if (type === "product") {
    for (let i = 0; i < 10; i++) {
      const sku = generateProductSKU(categoryName);
      const existing = await db.product.findFirst({ where: { sku } });
      if (!existing) return ok({ sku });
    }
    return fail(500, "Could not generate unique SKU");
  }

  if (type === "variant") {
    if (!productSku) return fail(400, "productSku required");
    // The option suffix is deterministic, so retrying it alone can never escape a
    // collision; number the retries instead (…-BLU, …-BLU-2, …-BLU-3).
    const base = generateVariantSKU(productSku, optionValues ?? []);
    for (let i = 0; i < 10; i++) {
      const sku = i === 0 ? base : `${base}-${i + 1}`;
      const existing = await db.productVariant.findFirst({ where: { sku } });
      if (!existing) return ok({ sku });
    }
    return fail(500, "Could not generate unique SKU");
  }

  return fail(400, "type must be product or variant");
}
