/**
 * admin-services/categories.ts — category logic shared by /api/admin/categories/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). The only
 * additions are read-only `preview*` functions used by MCP write tools.
 */
import { prisma } from "@/lib/prisma";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, fail } from "./result";

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
// Slug uniqueness must be checked through the tenant-scoped client so the lookup
// only sees THIS tenant's rows (slugs are unique per-tenant, not globally).
async function makeUniqueSlug(db: TenantPrisma, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await db.category.findFirst({
      where: excludeId ? { slug, NOT: { id: excludeId } } : { slug },
    });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// ── list / get ──────────────────────────────────────────────────────────────

export async function listCategories(db: TenantPrisma) {
  const categories = await db.category.findMany({
    orderBy: { position: "asc" },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: { select: { id: true, name: true, slug: true, isActive: true, position: true } },
      _count: { select: { products: true } },
    },
  });
  return ok({ categories });
}

export async function getCategory(db: TenantPrisma, id: string) {
  const category = await db.category.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: {
        orderBy: { position: "asc" },
        include: { _count: { select: { products: true } } },
      },
      products: {
        include: {
          product: {
            select: { id: true, name: true, slug: true, status: true, price: true },
          },
        },
      },
      _count: { select: { products: true } },
    },
  });
  if (!category) {
    return fail(404, "Category not found");
  }
  return ok({ category });
}

// ── create ──────────────────────────────────────────────────────────────────

export interface CategoryCreateBody {
  name: string;
  description?: string;
  parentId?: string;
  imageUrl?: string;
  isActive?: boolean;
  position?: number;
}

export async function createCategory(db: TenantPrisma, body: CategoryCreateBody) {
  if (!body.name) {
    return fail(400, "Name is required");
  }
  const baseSlug = generateSlug(body.name);
  const slug = await makeUniqueSlug(db, baseSlug);
  const maxPosition = await db.category.aggregate({ _max: { position: true } });
  const position = body.position ?? (maxPosition._max.position ?? 0) + 1;
  const category = await db.category.create({
    data: {
      tenantId: db.$tenantId,
      name: body.name,
      slug,
      description: body.description,
      parentId: body.parentId ?? null,
      imageUrl: body.imageUrl,
      isActive: body.isActive ?? true,
      position,
    },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      _count: { select: { products: true } },
    },
  });
  return ok({ category }, 201);
}

async function parentGuard(db: TenantPrisma, parentId: string | null | undefined) {
  if (!parentId) return ok(null);
  const parent = await db.category.findUnique({ where: { id: parentId }, select: { id: true, name: true } });
  if (!parent) return fail(404, `Parent category not found: ${parentId}`);
  return ok(parent);
}

export async function previewCreateCategory(db: TenantPrisma, body: CategoryCreateBody) {
  if (!body.name) {
    return fail(400, "Name is required");
  }
  const parent = await parentGuard(db, body.parentId);
  if (!parent.ok) return parent;
  const slug = await makeUniqueSlug(db, generateSlug(body.name));
  const maxPosition = await db.category.aggregate({ _max: { position: true } });
  const isActive = body.isActive ?? true;
  return ok({
    action: "create category",
    name: body.name,
    slug,
    parent: parent.data,
    isActive,
    position: body.position ?? (maxPosition._max.position ?? 0) + 1,
    note: isActive ? "Active categories are shown on the storefront." : "Inactive: not shown on the storefront.",
  });
}

// ── update ──────────────────────────────────────────────────────────────────

export interface CategoryUpdateBody {
  name?: string;
  description?: string | null;
  parentId?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  position?: number;
}

type CategoryUpdateData = Parameters<typeof prisma.category.update>[0]["data"];

async function buildCategoryUpdate(db: TenantPrisma, id: string, body: CategoryUpdateBody) {
  const updateData: CategoryUpdateData = {};
  if (body.name !== undefined) {
    updateData.name = body.name;
    const baseSlug = generateSlug(body.name);
    updateData.slug = await makeUniqueSlug(db, baseSlug, id);
  }
  if (body.description !== undefined) updateData.description = body.description;
  if (body.parentId !== undefined) updateData.parentId = body.parentId;
  if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.position !== undefined) updateData.position = body.position;
  return updateData;
}

export async function updateCategory(db: TenantPrisma, id: string, body: CategoryUpdateBody) {
  const existing = await db.category.findUnique({ where: { id } });
  if (!existing) {
    return fail(404, "Category not found");
  }
  const updateData = await buildCategoryUpdate(db, id, body);
  const category = await db.category.update({
    where: { id },
    data: updateData,
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: { orderBy: { position: "asc" } },
      _count: { select: { products: true } },
    },
  });
  return ok({ category });
}

export async function previewUpdateCategory(db: TenantPrisma, id: string, body: CategoryUpdateBody) {
  const existing = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) {
    return fail(404, "Category not found");
  }
  if (body.parentId === id) return fail(400, "A category cannot be its own parent");
  const parent = await parentGuard(db, body.parentId);
  if (!parent.ok) return parent;
  const data = (await buildCategoryUpdate(db, id, body)) as Record<string, unknown>;
  const current = existing as unknown as Record<string, unknown>;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(data)) {
    if ((current[k] ?? null) !== (to ?? null)) changes[k] = { from: current[k] ?? null, to: to ?? null };
  }
  return ok({
    category: { id: existing.id, name: existing.name, slug: existing.slug, productCount: existing._count.products },
    changes,
    ...(changes.isActive
      ? { note: changes.isActive.to ? "Category becomes visible on the storefront." : "Category is hidden from the storefront." }
      : {}),
  });
}

// ── delete ──────────────────────────────────────────────────────────────────

async function deleteGuard(db: TenantPrisma, id: string) {
  const existing = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true, children: true } } },
  });
  if (!existing) {
    return fail(404, "Category not found");
  }
  if (existing._count.products > 0) {
    return fail(
      400,
      `Cannot delete: ${existing._count.products} product(s) are assigned to this category. Remove them first.`,
      { productCount: existing._count.products }
    );
  }
  return ok(existing);
}

export async function deleteCategory(db: TenantPrisma, id: string) {
  const g = await deleteGuard(db, id);
  if (!g.ok) return g;
  await db.category.delete({ where: { id } });
  return ok({ success: true });
}

export async function previewDeleteCategory(db: TenantPrisma, id: string) {
  const g = await deleteGuard(db, id);
  if (!g.ok) return g;
  const children = await db.category.findMany({ where: { parentId: id }, select: { id: true, name: true } });
  return ok({
    category: { id: g.data.id, name: g.data.name, slug: g.data.slug, isActive: g.data.isActive },
    permanentlyDeletes: "this category (no products are assigned)",
    childCategories: children,
    ...(children.length
      ? { childNote: "Child categories are not deleted; they lose their parent link and become top-level." }
      : {}),
  });
}
