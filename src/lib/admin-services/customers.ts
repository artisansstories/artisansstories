/**
 * admin-services/customers.ts — customer logic shared by /api/admin/customers/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). Additions:
 * read-only `preview*` functions and `findCustomerIdByEmail` for MCP.
 */
import { Prisma } from "@prisma/client";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, fail } from "./result";

// ── list / get ──────────────────────────────────────────────────────────────

export interface CustomerListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export async function listCustomers(db: TenantPrisma, p: CustomerListParams) {
  const search = p.search ?? "";
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(100, Math.max(1, p.limit ?? 20));
  const where: Prisma.CustomerWhereInput = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
    ];
  }
  const cancelledStatuses = ["CANCELLED", "REFUNDED"];
  const voidedFinancial = ["VOIDED", "REFUNDED", "PARTIALLY_REFUNDED"];

  const [rawCustomers, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { totalSpent: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        lastOrderAt: true,
        createdAt: true,
        orders: {
          select: {
            total: true,
            status: true,
            financialStatus: true,
          },
        },
      },
    }),
    db.customer.count({ where }),
  ]);

  // Compute live stats per customer
  const customers = rawCustomers.map((c) => {
    const activeOrders = c.orders.filter(
      (o) => !cancelledStatuses.includes(o.status) && !voidedFinancial.includes(o.financialStatus)
    );
    return {
      id: c.id,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      lastOrderAt: c.lastOrderAt,
      createdAt: c.createdAt,
      totalOrders: activeOrders.length,
      totalOrdersAll: c.orders.length,
      totalSpent: activeOrders.reduce((sum, o) => sum + o.total, 0),
    };
  });

  return ok({
    customers,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function getCustomer(db: TenantPrisma, id: string) {
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: { isDefault: "desc" } },
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: { select: { name: true, images: { take: 1, select: { urlThumb: true, url: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!customer) {
    return fail(404, "Customer not found");
  }

  // Compute live stats from actual orders (ignoring stale denormalized counters)
  const cancelledStatuses = new Set(["CANCELLED", "REFUNDED"]);
  const voidedFinancial = new Set(["VOIDED", "REFUNDED", "PARTIALLY_REFUNDED"]);

  const activeOrders = customer.orders.filter(
    (o) => !cancelledStatuses.has(o.status) && !voidedFinancial.has(o.financialStatus)
  );
  const cancelledOrders = customer.orders.filter(
    (o) => cancelledStatuses.has(o.status) || voidedFinancial.has(o.financialStatus)
  );

  const netSpent = activeOrders.reduce((sum, o) => sum + o.total, 0);
  const grossSpent = customer.orders.reduce((sum, o) => sum + o.total, 0);
  const refundedAmount = cancelledOrders.reduce((sum, o) => sum + o.total, 0);

  const liveStats = {
    totalOrdersAll: customer.orders.length,
    totalOrdersActive: activeOrders.length,
    totalOrdersCancelled: cancelledOrders.length,
    netSpent,
    grossSpent,
    refundedAmount,
  };

  return ok({ customer, liveStats });
}

/** MCP convenience: resolve a customer by email (unique per tenant). */
export async function findCustomerIdByEmail(db: TenantPrisma, email: string): Promise<string | null> {
  const c = await db.customer.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  return c?.id ?? null;
}

// ── update (notes / tags) ───────────────────────────────────────────────────

export interface CustomerUpdateBody {
  notes?: string;
  tags?: string[];
}

export async function updateCustomer(db: TenantPrisma, id: string, body: CustomerUpdateBody) {
  const customer = await db.customer.update({
    where: { id },
    data: {
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.tags !== undefined && { tags: body.tags }),
    },
  });

  return ok({ customer });
}

export async function previewCustomerUpdate(db: TenantPrisma, id: string, body: CustomerUpdateBody) {
  const c = await db.customer.findUnique({
    where: { id },
    select: { email: true, firstName: true, lastName: true, notes: true, tags: true },
  });
  if (!c) return fail(404, "Customer not found");
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (body.notes !== undefined && body.notes !== c.notes) changes.notes = { from: c.notes, to: body.notes };
  if (body.tags !== undefined && JSON.stringify(body.tags) !== JSON.stringify(c.tags)) {
    changes.tags = { from: c.tags, to: body.tags };
  }
  return ok({
    customer: { id, email: c.email, name: [c.firstName, c.lastName].filter(Boolean).join(" ") || null },
    changes,
    noChange: Object.keys(changes).length === 0,
    note: "Internal fields only; the customer is not notified.",
  });
}
