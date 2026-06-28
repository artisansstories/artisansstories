import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import {
  CHECKOUT_MODES,
  TENANT_STATUSES,
  type CheckoutMode,
  type TenantStatusValue,
} from "@/lib/platform-tenants";
import { TENANT_SCOPED_MODELS } from "@/lib/tenant-prisma";
import { deleteObjectsByPrefix } from "@/lib/r2";
import { getTenantStats, PAID_FINANCIAL_STATUSES } from "@/lib/platform-tenant-stats";

/**
 * /api/platform/tenants/[id] — single-tenant read / update (P6)
 *
 *   GET   → tenant detail incl. theme, Stripe status flags, API-key + product counts.
 *   PATCH → update name / status / platformFeeBps / checkoutMode.
 *
 * AUTH: requirePlatformOperator — operator `as-platform-session` cookie (P10).
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      isPlatformOwner: true,
      platformFeeBps: true,
      checkoutMode: true,
      stripeConnectAccountId: true,
      stripeOnboarded: true,
      createdAt: true,
      updatedAt: true,
      theme: true,
      _count: { select: { apiKeys: true } },
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const productCount = await prisma.product.count({ where: { tenantId: id } });
  const activeApiKeyCount = await prisma.tenantApiKey.count({
    where: { tenantId: id, revokedAt: null },
  });
  // storeEnabled lives on the tenant's own StoreSettings — surface it so the
  // detail header can label the "View store" link as a preview when not live.
  const settings = await prisma.storeSettings.findUnique({
    where: { tenantId: id },
    select: { storeEnabled: true },
  });
  // Ops stats (orders / paid revenue / customers) for the Overview card. These
  // also surface the data behind the hard-delete gate (a store with paid orders
  // is archive-only) so the operator can tell a live, earning store from a dead
  // one at a glance (A6 / P1-3).
  const stats = await getTenantStats(id);

  const { _count, theme, stripeConnectAccountId, ...rest } = tenant;

  return NextResponse.json({
    ...rest,
    stripe: {
      connected: Boolean(stripeConnectAccountId),
      accountId: stripeConnectAccountId,
      onboarded: tenant.stripeOnboarded,
    },
    theme,
    apiKeyCount: _count.apiKeys,
    activeApiKeyCount,
    productCount,
    storeEnabled: settings?.storeEnabled ?? false,
    stats,
  });
}

interface PatchBody {
  name?: unknown;
  status?: unknown;
  platformFeeBps?: unknown;
  checkoutMode?: unknown;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let operator;
  try {
    operator = await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id } = await params;

  const existing = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, isPlatformOwner: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const errors: string[] = [];
  const data: {
    name?: string;
    status?: TenantStatusValue;
    platformFeeBps?: number;
    checkoutMode?: CheckoutMode;
  } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) errors.push("`name` must be a non-empty string.");
    else data.name = name;
  }

  if (body.status !== undefined) {
    if (!TENANT_STATUSES.includes(body.status as TenantStatusValue)) {
      errors.push(`\`status\` must be one of: ${TENANT_STATUSES.join(", ")}.`);
    } else {
      data.status = body.status as TenantStatusValue;
    }
  }

  if (body.platformFeeBps !== undefined) {
    if (
      typeof body.platformFeeBps !== "number" ||
      !Number.isInteger(body.platformFeeBps) ||
      body.platformFeeBps < 0 ||
      body.platformFeeBps > 10_000
    ) {
      errors.push("`platformFeeBps` must be an integer between 0 and 10000.");
    } else {
      data.platformFeeBps = body.platformFeeBps;
    }
  }

  if (body.checkoutMode !== undefined) {
    if (!CHECKOUT_MODES.includes(body.checkoutMode as CheckoutMode)) {
      errors.push(`\`checkoutMode\` must be one of: ${CHECKOUT_MODES.join(", ")}.`);
    } else {
      data.checkoutMode = body.checkoutMode as CheckoutMode;
    }
  }

  if (errors.length) {
    return NextResponse.json({ error: "validation_failed", errors }, { status: 400 });
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_fields", message: "No updatable fields supplied." }, { status: 400 });
  }

  // ── Lifecycle guards + side-effects (P0-5, P0-1 tier 1, P1-1) ──────────────
  const prevStatus = existing.status;
  const nextStatus = data.status;

  // The house / platform-owner singleton powers /shop + the flagship store; it
  // can never be archived or suspended (P0-5). Hard-block at the API, not just
  // the UI, so a stray PATCH can't take it offline.
  if (
    existing.isPlatformOwner &&
    (nextStatus === "ARCHIVED" || nextStatus === "SUSPENDED")
  ) {
    return NextResponse.json(
      {
        error: "platform_owner_protected",
        message: "The house store cannot be archived or suspended.",
      },
      { status: 403 },
    );
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      platformFeeBps: true,
      checkoutMode: true,
      stripeOnboarded: true,
      updatedAt: true,
    },
  });

  // Audit + key handling keyed on the actual status transition. Mirrors the
  // go-live audit pattern (operatorId/operatorEmail/action/tenantId/detail).
  if (nextStatus && nextStatus !== prevStatus) {
    if (nextStatus === "ARCHIVED") {
      // Security-first: revoke every active key on archive. Keys are NOT auto-
      // restored on reactivate — the operator re-mints (intended).
      await prisma.tenantApiKey.updateMany({
        where: { tenantId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.platformAuditLog.create({
        data: {
          operatorId: operator.id,
          operatorEmail: operator.email,
          action: "tenant.archive",
          tenantId: id,
          detail: `archived "${existing.name}"`,
        },
      });
    } else if (nextStatus === "SUSPENDED") {
      await prisma.platformAuditLog.create({
        data: {
          operatorId: operator.id,
          operatorEmail: operator.email,
          action: "tenant.suspend",
          tenantId: id,
          detail: `suspended "${existing.name}"`,
        },
      });
    } else if (
      nextStatus === "ACTIVE" &&
      (prevStatus === "ARCHIVED" || prevStatus === "SUSPENDED")
    ) {
      await prisma.platformAuditLog.create({
        data: {
          operatorId: operator.id,
          operatorEmail: operator.email,
          action: "tenant.reactivate",
          tenantId: id,
          detail: `reactivated "${existing.name}" (was ${prevStatus})`,
        },
      });
    }
  }

  return NextResponse.json(tenant);
}

// ── Hard delete (P0-1 tier 2, P0-2, P1-8) ───────────────────────────────────

/**
 * FK-safe leaf→root deletion order for the tenant sweep. Every tenant-scoped
 * model carries a bare `tenantId` string column with NO foreign key to Tenant
 * (only TenantApiKey + TenantTheme cascade), so `tenant.delete()` alone would
 * silently orphan ~33 tables (Products, Orders, Customers/PII, …). We therefore
 * `deleteMany({ where: { tenantId } })` EVERY model explicitly.
 *
 * Order is leaf→root: rows that are referenced by other rows are deleted last,
 * so no delete trips a referential constraint and nothing relies on cascade.
 * (Intra-tenant required relations all cascade and optionals SetNull, but we
 * delete explicitly in order regardless — the bare-`tenantId` tables cascade
 * nothing, which is the whole point of this manifest sweep.)
 *
 * A startup guard below asserts this list is EXACTLY TENANT_SCOPED_MODELS, so
 * adding a model to the manifest without sequencing it here fails loudly rather
 * than silently orphaning the new table.
 */
const TENANT_DELETE_ORDER: string[] = [
  // order graph leaves
  "OrderItemAddon",
  "ReturnItem",
  "Fulfillment",
  "Return",
  "OrderItem",
  "Order",
  "Address",
  "Review",
  // catalog leaves
  "InventoryLog",
  "Inventory",
  "ProductImage",
  "ProductVariant",
  "ProductOption",
  "ProductCategory",
  "ProductArtisan",
  "ProductAddon",
  "Product",
  "Category",
  "Customer",
  // artisans
  "ArtisanImage",
  "Artisan",
  // shipping
  "ShippingRate",
  "ShippingZone",
  // contact / messaging
  "ContactReply",
  "ContactMessage",
  // link tree
  "LinkTreeClickLog",
  "LinkTreeLink",
  "LinkTreeSettings",
  // standalone tenant rows
  "Discount",
  "StoreSettings",
  "AdminUser",
  "WelcomeEmailTemplate",
  "EmailLog",
  "KBArticle",
];

// Completeness guard: the sweep order must cover the manifest EXACTLY — no
// missing model (would orphan rows) and no stale entry (would throw at runtime).
(() => {
  const order = new Set(TENANT_DELETE_ORDER);
  const missing = [...TENANT_SCOPED_MODELS].filter((m) => !order.has(m));
  const extra = TENANT_DELETE_ORDER.filter((m) => !TENANT_SCOPED_MODELS.has(m));
  if (missing.length || extra.length) {
    throw new Error(
      `TENANT_DELETE_ORDER out of sync with TENANT_SCOPED_MODELS — missing: [${missing.join(", ")}], extra: [${extra.join(", ")}]`,
    );
  }
})();

/** Prisma delegate key for a PascalCase model name (Prisma lowercases only the
 * first character: "KBArticle" → "kBArticle", "StoreSettings" → "storeSettings"). */
function delegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

// `PAID_FINANCIAL_STATUSES` (the "store captured money → archive-only" set) is
// the single source of truth shared with the tenant-stats revenue figure; it is
// imported from platform-tenant-stats so the delete gate and the displayed
// revenue can never drift apart (Open Question 2: "no _paid_ orders").

interface DeleteBody {
  confirmSlug?: unknown;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let operator;
  try {
    operator = await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true, isPlatformOwner: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  // P0-5: the house / platform-owner singleton powers /shop + the flagship
  // store; it is never deletable, hard-blocked at the API (not just the UI).
  if (tenant.isPlatformOwner) {
    return NextResponse.json({ error: "platform_owner_undeletable" }, { status: 403 });
  }

  let body: DeleteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Typed-slug confirmation: the operator must type the exact slug.
  if (typeof body.confirmSlug !== "string" || body.confirmSlug !== tenant.slug) {
    return NextResponse.json({ error: "slug_mismatch" }, { status: 409 });
  }

  // A store that ever captured money is archive-only, never hard-deletable.
  const paidOrders = await prisma.order.count({
    where: { tenantId: id, financialStatus: { in: [...PAID_FINANCIAL_STATUSES] } },
  });
  if (paidOrders > 0) {
    return NextResponse.json(
      { error: "has_paid_orders", count: paidOrders },
      { status: 409 },
    );
  }

  // Snapshot row counts for the audit detail BEFORE we sweep anything.
  const productCount = await prisma.product.count({ where: { tenantId: id } });
  const customerCount = await prisma.customer.count({ where: { tenantId: id } });
  const orderCount = await prisma.order.count({ where: { tenantId: id } });

  // Write the audit row BEFORE the sweep so the trail survives the delete
  // (PlatformAuditLog.tenantId is a nullable string, not an FK — it persists).
  await prisma.platformAuditLog.create({
    data: {
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "tenant.delete",
      tenantId: id,
      detail: JSON.stringify({
        slug: tenant.slug,
        name: tenant.name,
        counts: { products: productCount, customers: customerCount, orders: orderCount },
      }),
    },
  });

  // Transactional sweep: deleteMany every scoped model in FK-safe order, then
  // delete the Tenant row last (cascades TenantApiKey + TenantTheme). One
  // interactive transaction keeps the sweep atomic — either the tenant is fully
  // gone or nothing changed. Timeout bumped for tenants with large catalogs.
  await prisma.$transaction(
    async (tx) => {
      const txModels = tx as unknown as Record<
        string,
        { deleteMany(args: { where: { tenantId: string } }): Promise<unknown> }
      >;
      for (const model of TENANT_DELETE_ORDER) {
        await txModels[delegateKey(model)].deleteMany({ where: { tenantId: id } });
      }
      await tx.tenant.delete({ where: { id } });
    },
    { timeout: 30_000 },
  );

  // Stripe: detach only. Nulling our-side ids happened implicitly by deleting
  // the Tenant row; we never call any remote Stripe account-delete (it's the
  // merchant's account, not ours — Open Question 4).

  // R2: best-effort sweep of `tenants/{id}/…`. Never fail the delete on an R2
  // error — the DB sweep already committed and is the source of truth.
  try {
    const removed = await deleteObjectsByPrefix(`tenants/${id}/`);
    console.log(`[tenant.delete] R2 prefix tenants/${id}/ — removed ${removed} object(s)`);
  } catch (err) {
    console.error(`[tenant.delete] R2 prefix sweep failed for tenants/${id}/`, err);
  }

  return NextResponse.json({ deleted: true, slug: tenant.slug });
}
