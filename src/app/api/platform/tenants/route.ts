import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import {
  CHECKOUT_MODES,
  isValidSlug,
  type CheckoutMode,
} from "@/lib/platform-tenants";

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

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
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

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      ...t,
      productCount: countByTenant.get(t.id) ?? 0,
    })),
  });
}
