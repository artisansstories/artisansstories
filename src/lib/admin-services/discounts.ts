/**
 * admin-services/discounts.ts — discount logic shared by /api/admin/discounts/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). Prisma
 * P2002/P2025 handling that the routes did in their catch blocks lives here now
 * (same log line, same status/body); every other error is rethrown so the route
 * keeps its original 500. Additions: read-only `preview*` functions.
 */
import { DiscountType, type Discount } from "@prisma/client";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, fail } from "./result";

function prismaCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err ? (err as { code: string }).code : undefined;
}

// ── list / get ──────────────────────────────────────────────────────────────

export async function listDiscounts(db: TenantPrisma, p: { page?: number; limit?: number }) {
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(100, Math.max(1, p.limit ?? 20));
  const skip = (page - 1) * limit;
  const [discounts, total] = await Promise.all([
    db.discount.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.discount.count(),
  ]);
  return ok({
    discounts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getDiscount(db: TenantPrisma, id: string) {
  const discount = await db.discount.findUnique({ where: { id } });
  if (!discount) return fail(404, "Not found");
  return ok({ discount });
}

/** MCP convenience: resolve a discount by code (unique per tenant, stored upper-case). */
export async function findDiscountIdByCode(db: TenantPrisma, code: string): Promise<string | null> {
  const d = await db.discount.findFirst({ where: { code: code.trim().toUpperCase() }, select: { id: true } });
  return d?.id ?? null;
}

// ── generate code ───────────────────────────────────────────────────────────

export function generateDiscountCode() {
  const prefixes = ["SAVE", "GET", "USE", "ARTISAN", "CRAFT", "SHOP", "OFF", "DEAL"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 80) + 5; // 5–85
  return ok({ code: `${prefix}${number}` });
}

// ── shared preview helpers ──────────────────────────────────────────────────

type DiscountShape = Pick<
  Discount,
  "code" | "type" | "value" | "minimumOrderAmount" | "appliesToAll" | "productIds" | "categoryIds"
  | "usageLimit" | "perCustomerLimit" | "startsAt" | "endsAt" | "isActive"
>;

function describeValue(type: DiscountType, value: number): string {
  if (type === "PERCENTAGE") return `${value}% off`;
  if (type === "FIXED_AMOUNT") return `$${(value / 100).toFixed(2)} off`;
  return "Free shipping";
}

function summarize(d: DiscountShape) {
  const now = new Date();
  let window: string;
  if (d.endsAt && d.endsAt < now) window = "expired";
  else if (d.startsAt && d.startsAt > now) window = "scheduled (not started yet)";
  else window = "currently within its validity window";
  return {
    code: d.code,
    type: d.type,
    value: d.value,
    valueDescription: describeValue(d.type, d.value),
    minimumOrderAmount: d.minimumOrderAmount,
    appliesToAll: d.appliesToAll,
    productIds: d.productIds,
    categoryIds: d.categoryIds,
    usageLimit: d.usageLimit,
    perCustomerLimit: d.perCustomerLimit,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    isActive: d.isActive,
    validity: d.isActive ? window : "inactive (cannot be redeemed)",
  };
}

function badDate(s: string | null | undefined): boolean {
  return !!s && isNaN(new Date(s).getTime());
}

// ── create ──────────────────────────────────────────────────────────────────

export interface DiscountCreateBody {
  code: string;
  type: DiscountType;
  value: number;
  minimumOrderAmount?: number;
  appliesToAll?: boolean;
  productIds?: string[];
  categoryIds?: string[];
  usageLimit?: number;
  perCustomerLimit?: number;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
}

export async function createDiscount(db: TenantPrisma, body: DiscountCreateBody) {
  if (!body.code || !body.type || body.value === undefined) {
    return fail(400, "code, type and value are required");
  }
  try {
    const discount = await db.discount.create({
      data: {
        tenantId: db.$tenantId,
        code: body.code.trim().toUpperCase(),
        type: body.type,
        value: body.value,
        minimumOrderAmount: body.minimumOrderAmount ?? null,
        appliesToAll: body.appliesToAll ?? true,
        productIds: body.productIds ?? [],
        categoryIds: body.categoryIds ?? [],
        usageLimit: body.usageLimit ?? null,
        perCustomerLimit: body.perCustomerLimit ?? null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        isActive: body.isActive ?? true,
      },
    });
    return ok({ discount }, 201);
  } catch (err: unknown) {
    if (prismaCode(err) === "P2002") {
      console.error("POST /api/admin/discounts error:", err);
      return fail(409, "Discount code already exists");
    }
    throw err;
  }
}

export async function previewCreateDiscount(db: TenantPrisma, body: DiscountCreateBody) {
  if (!body.code || !body.type || body.value === undefined) {
    return fail(400, "code, type and value are required");
  }
  if (badDate(body.startsAt) || badDate(body.endsAt)) return fail(400, "startsAt/endsAt must be valid ISO dates");
  const code = body.code.trim().toUpperCase();
  const existing = await db.discount.findFirst({ where: { code }, select: { id: true } });
  if (existing) return fail(409, "Discount code already exists", { existingDiscountId: existing.id });
  return ok({
    action: "create",
    discount: summarize({
      code,
      type: body.type,
      value: body.value,
      minimumOrderAmount: body.minimumOrderAmount ?? null,
      appliesToAll: body.appliesToAll ?? true,
      productIds: body.productIds ?? [],
      categoryIds: body.categoryIds ?? [],
      usageLimit: body.usageLimit ?? null,
      perCustomerLimit: body.perCustomerLimit ?? null,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      isActive: body.isActive ?? true,
    }),
  });
}

// ── update (PUT) ────────────────────────────────────────────────────────────

export interface DiscountUpdateBody {
  code?: string;
  type?: DiscountType;
  value?: number;
  minimumOrderAmount?: number | null;
  appliesToAll?: boolean;
  productIds?: string[];
  categoryIds?: string[];
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

function updateData(body: DiscountUpdateBody) {
  return {
    ...(body.code !== undefined && { code: body.code.trim().toUpperCase() }),
    ...(body.type !== undefined && { type: body.type }),
    ...(body.value !== undefined && { value: body.value }),
    ...(body.minimumOrderAmount !== undefined && { minimumOrderAmount: body.minimumOrderAmount }),
    ...(body.appliesToAll !== undefined && { appliesToAll: body.appliesToAll }),
    ...(body.productIds !== undefined && { productIds: body.productIds }),
    ...(body.categoryIds !== undefined && { categoryIds: body.categoryIds }),
    ...(body.usageLimit !== undefined && { usageLimit: body.usageLimit }),
    ...(body.perCustomerLimit !== undefined && { perCustomerLimit: body.perCustomerLimit }),
    ...(body.startsAt !== undefined && { startsAt: body.startsAt ? new Date(body.startsAt) : null }),
    ...(body.endsAt !== undefined && { endsAt: body.endsAt ? new Date(body.endsAt) : null }),
    ...(body.isActive !== undefined && { isActive: body.isActive }),
  };
}

export async function updateDiscount(db: TenantPrisma, id: string, body: DiscountUpdateBody) {
  try {
    const discount = await db.discount.update({
      where: { id },
      data: updateData(body),
    });
    return ok({ discount });
  } catch (err: unknown) {
    const code = prismaCode(err);
    if (code === "P2002") {
      console.error("PUT /api/admin/discounts/[id] error:", err);
      return fail(409, "Discount code already exists");
    }
    if (code === "P2025") {
      console.error("PUT /api/admin/discounts/[id] error:", err);
      return fail(404, "Not found");
    }
    throw err;
  }
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (a instanceof Date ? a.getTime() : a) === (b instanceof Date ? b.getTime() : b);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function previewUpdateDiscount(db: TenantPrisma, id: string, body: DiscountUpdateBody) {
  const current = await db.discount.findUnique({ where: { id } });
  if (!current) return fail(404, "Not found");
  if (badDate(body.startsAt) || badDate(body.endsAt)) return fail(400, "startsAt/endsAt must be valid ISO dates");
  const data = updateData(body) as Partial<DiscountShape>;
  if (data.code !== undefined && data.code !== current.code) {
    const clash = await db.discount.findFirst({ where: { code: data.code, NOT: { id } }, select: { id: true } });
    if (clash) return fail(409, "Discount code already exists", { existingDiscountId: clash.id });
  }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(data)) {
    const from = current[k as keyof Discount];
    if (!same(from, v)) changes[k] = { from, to: v };
  }
  const after = { ...current, ...data } as DiscountShape;
  return ok({
    action: "update",
    discountId: id,
    code: current.code,
    changes,
    noChange: Object.keys(changes).length === 0,
    after: summarize(after),
    usageCount: current.usageCount,
  });
}

// ── toggle active (PATCH) ───────────────────────────────────────────────────

export async function setDiscountActive(db: TenantPrisma, id: string, isActive: boolean) {
  const discount = await db.discount.update({
    where: { id },
    data: { isActive },
  });
  return ok({ discount });
}

// ── delete ──────────────────────────────────────────────────────────────────

export async function deleteDiscount(db: TenantPrisma, id: string) {
  await db.discount.delete({ where: { id } });
  return ok({ success: true });
}

export async function previewDeleteDiscount(db: TenantPrisma, id: string) {
  const d = await db.discount.findUnique({ where: { id } });
  if (!d) return fail(404, "Not found");
  const ordersUsingCode = await db.order.count({ where: { discountCode: d.code } });
  return ok({
    action: "delete",
    deletes: summarize(d),
    usageCount: d.usageCount,
    ordersUsingCode,
    effect:
      "The discount row is permanently deleted; the code stops working at checkout immediately. Past orders keep their recorded discount code and amounts (stored as text on the order, not a reference). Consider discounts_update with isActive=false to disable it reversibly.",
  });
}
