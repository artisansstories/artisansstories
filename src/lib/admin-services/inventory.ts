/**
 * admin-services/inventory.ts — inventory logic shared by /api/admin/inventory/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). The only
 * addition is the read-only `previewAdjustInventory` used by the MCP write tool.
 */
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, fail } from "./result";

export interface InventoryListParams {
  lowStock?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listInventory(db: TenantPrisma, p: InventoryListParams) {
  const search = p.search ?? "";
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(100, Math.max(1, p.limit ?? 50));
  const inventory = await db.inventory.findMany({
    include: {
      variant: {
        include: {
          product: {
            include: {
              images: { where: { isDefault: true }, take: 1 },
            },
          },
        },
      },
    },
    orderBy: [{ quantity: "asc" }],
  });
  // Filter in JS (Prisma can't compare two fields natively)
  let filtered = inventory;
  if (p.lowStock) {
    filtered = filtered.filter(
      (inv) => inv.quantity > 0 && inv.quantity <= inv.lowStockThreshold
    );
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (inv) =>
        inv.variant.product.name.toLowerCase().includes(q) ||
        (inv.variant.sku ?? "").toLowerCase().includes(q) ||
        (inv.variant.product.sku ?? "").toLowerCase().includes(q) ||
        inv.variant.name.toLowerCase().includes(q)
    );
  }
  const total = filtered.length;
  const paginated = filtered.slice((page - 1) * limit, page * limit);
  return ok({
    inventory: paginated,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

/** Raw PATCH body: `quantity` (absolute) wins over `delta` when both are numbers. */
export interface InventoryAdjustBody {
  quantity?: unknown;
  delta?: unknown;
}

async function adjustGuard(db: TenantPrisma, id: string, body: InventoryAdjustBody) {
  // Fetch current inventory
  const current = await db.inventory.findUnique({ where: { id } });
  if (!current) return fail(404, "Not found");
  let newQty: number;
  if (typeof body.quantity === "number") {
    newQty = Math.max(0, body.quantity);
  } else if (typeof body.delta === "number") {
    newQty = Math.max(0, current.quantity + body.delta);
  } else {
    return fail(400, "Provide quantity or delta");
  }
  return ok({ current, newQty });
}

export async function adjustInventory(db: TenantPrisma, id: string, body: InventoryAdjustBody) {
  const g = await adjustGuard(db, id, body);
  if (!g.ok) return g;
  const { current, newQty } = g.data;
  const oldQty = current.quantity;
  const delta = newQty - oldQty;
  const [updated] = await db.$transaction([
    db.inventory.update({
      where: { id },
      data: { quantity: newQty },
      include: {
        variant: {
          include: {
            product: {
              include: {
                images: { where: { isDefault: true }, take: 1 },
              },
            },
          },
        },
      },
    }),
    db.inventoryLog.create({
      data: {
        tenantId: db.$tenantId,
        inventoryId: id,
        delta,
        reason: "Manual adjustment",
        note: `Adjusted from ${oldQty} to ${newQty}`,
      },
    }),
  ]);
  return ok(updated);
}

export async function previewAdjustInventory(db: TenantPrisma, id: string, body: InventoryAdjustBody) {
  const g = await adjustGuard(db, id, body);
  if (!g.ok) return g;
  const { current, newQty } = g.data;
  const variant = await db.productVariant.findUnique({
    where: { id: current.variantId },
    select: { id: true, name: true, sku: true, product: { select: { id: true, name: true, status: true } } },
  });
  const requested =
    typeof body.quantity === "number" ? body.quantity : current.quantity + (body.delta as number);
  return ok({
    inventoryId: id,
    product: variant?.product ?? null,
    variant: variant ? { id: variant.id, name: variant.name, sku: variant.sku } : null,
    quantity: { from: current.quantity, to: newQty },
    delta: newQty - current.quantity,
    ...(requested < 0 ? { note: `Requested ${requested}; quantity is floored at 0.` } : {}),
    lowStockThreshold: current.lowStockThreshold,
    logEntry: { reason: "Manual adjustment", note: `Adjusted from ${current.quantity} to ${newQty}` },
  });
}
