import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import {
  CHECKOUT_MODES,
  TENANT_STATUSES,
  isValidSlug,
  type CheckoutMode,
  type TenantStatusValue,
} from "@/lib/platform-tenants";
import type { Prisma } from "@prisma/client";

/**
 * /api/platform/tenants — platform-operator tenant collection (P6)
 *
 *   POST → create a tenant (+ default TenantTheme + default StoreSettings).
 *   GET  → list tenants with summary fields (incl. product count).
 *
 * AUTH: requirePlatformOperator — operator `as-platform-session` cookie (P10).
 * See src/lib/platform-auth.ts (now a shim over platform-session.ts).
 *
 * Tenant / TenantTheme / StoreSettings are written via the raw `prisma` client
 * with explicit `tenantId`: there is no request-scoped tenant for a *create*,
 * and the new rows belong to the tenant being created, not to the operator.
 */

interface CreateTenantBody {
  name?: unknown;
  slug?: unknown;
  platformFeeBps?: unknown;
  checkoutMode?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  let body: CreateTenantBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const errors: string[] = [];

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) errors.push("`name` is required.");

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!isValidSlug(slug)) {
    errors.push(
      "`slug` must be lowercase, url-safe, hyphen-delimited (e.g. `mikes-pottery`).",
    );
  }

  let platformFeeBps: number | undefined;
  if (body.platformFeeBps !== undefined) {
    if (
      typeof body.platformFeeBps !== "number" ||
      !Number.isInteger(body.platformFeeBps) ||
      body.platformFeeBps < 0 ||
      body.platformFeeBps > 10_000
    ) {
      errors.push("`platformFeeBps` must be an integer between 0 and 10000.");
    } else {
      platformFeeBps = body.platformFeeBps;
    }
  }

  let checkoutMode: CheckoutMode | undefined;
  if (body.checkoutMode !== undefined) {
    if (!CHECKOUT_MODES.includes(body.checkoutMode as CheckoutMode)) {
      errors.push(`\`checkoutMode\` must be one of: ${CHECKOUT_MODES.join(", ")}.`);
    } else {
      checkoutMode = body.checkoutMode as CheckoutMode;
    }
  }

  if (errors.length) {
    return NextResponse.json({ error: "validation_failed", errors }, { status: 400 });
  }

  // Slug uniqueness → 409.
  const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: "slug_taken", message: `Slug "${slug}" is already in use.` },
      { status: 409 },
    );
  }

  // Create the tenant and its default theme + store settings atomically.
  const tenant = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        name,
        slug,
        ...(platformFeeBps !== undefined ? { platformFeeBps } : {}),
        ...(checkoutMode !== undefined ? { checkoutMode } : {}),
      },
    });
    // Default theme (all columns carry schema defaults; key by tenantId).
    await tx.tenantTheme.create({ data: { tenantId: t.id } });
    // Default store settings — seed storeName from the tenant name.
    await tx.storeSettings.create({ data: { tenantId: t.id, storeName: name } });
    return t;
  });

  return NextResponse.json(
    {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      platformFeeBps: tenant.platformFeeBps,
      checkoutMode: tenant.checkoutMode,
      stripeOnboarded: tenant.stripeOnboarded,
      createdAt: tenant.createdAt,
    },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  // ── Search / filter / sort (A5 / P1-2) ─────────────────────────────────────
  // Server-side so the list scales past ~20 tenants. All params optional; the
  // defaults reproduce the prior behaviour (archived hidden, newest first).
  const sp = req.nextUrl?.searchParams;

  // Archived tenants drop out of the default list (the operator off-ramp); pass
  // ?includeArchived=1 to surface them (the "Show archived" toggle in the UI).
  const includeArchived = sp?.get("includeArchived") === "1";

  // ?status= filters to one exact lifecycle state. An explicit status takes
  // precedence over the archived toggle (status=ARCHIVED always shows archived;
  // any other status implicitly excludes archived since it's a different state).
  const statusParam = sp?.get("status")?.toUpperCase();
  const status =
    statusParam && TENANT_STATUSES.includes(statusParam as TenantStatusValue)
      ? (statusParam as TenantStatusValue)
      : undefined;

  // ?q= case-insensitive match on name OR slug.
  const q = sp?.get("q")?.trim();

  const where: Prisma.TenantWhereInput = {};
  if (status) {
    where.status = status;
  } else if (!includeArchived) {
    where.status = { not: "ARCHIVED" };
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  // ?sort= column, ?dir= direction. Sensible per-column defaults (newest-first
  // for dates, A→Z for text) when dir is omitted.
  const sortParam = sp?.get("sort");
  const dirParam = sp?.get("dir");
  const dir: "asc" | "desc" | undefined =
    dirParam === "asc" || dirParam === "desc" ? dirParam : undefined;
  let orderBy: Prisma.TenantOrderByWithRelationInput;
  switch (sortParam) {
    case "name":
      orderBy = { name: dir ?? "asc" };
      break;
    case "status":
      orderBy = { status: dir ?? "asc" };
      break;
    case "createdAt":
    default:
      orderBy = { createdAt: dir ?? "desc" };
      break;
  }

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      isPlatformOwner: true,
      stripeConnectAccountId: true,
      stripeOnboarded: true,
      createdAt: true,
    },
  });

  // Product is tenant-scoped; count per tenant in one grouped query.
  const counts = await prisma.product.groupBy({
    by: ["tenantId"],
    _count: { _all: true },
  });
  const countByTenant = new Map(counts.map((c) => [c.tenantId, c._count._all]));

  // storeEnabled lives on each tenant's own StoreSettings (no relation back to
  // Tenant). Surface it so the console can label a non-live "/t/{slug}" link as
  // a preview rather than springing a 404 on the operator (P0-3 / P1-7).
  const settings = await prisma.storeSettings.findMany({
    select: { tenantId: true, storeEnabled: true },
  });
  const enabledByTenant = new Map(settings.map((s) => [s.tenantId, s.storeEnabled]));

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      ...t,
      productCount: countByTenant.get(t.id) ?? 0,
      storeEnabled: enabledByTenant.get(t.id) ?? false,
    })),
  });
}
