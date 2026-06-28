import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import { ProductStatus } from "@prisma/client";

/**
 * POST /api/platform/tenants/[id]/products — operator-callable minimal product create (O1)
 *
 * Closes the "no operator-callable product create" gap: `POST /api/admin/products`
 * requires a store-admin `as-admin-session`, which an operator does not have. This
 * mirrors that route's default-variant + zero-qty Inventory block, but written via
 * the RAW prisma client with an explicit `tenantId` from the path (operators carry
 * no request-scoped tenant context). Minimal by design — one product satisfies the
 * onboarding "not empty" gate; rich editing happens via impersonation.
 *
 * Body: { name: string, price: number (DOLLARS), description?: string }
 *
 * AUTH: requirePlatformOperator — operator `as-platform-session` cookie (P10).
 */

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Slug uniqueness is per-tenant (`@@unique([tenantId, slug])`), so the lookup is
// scoped to THIS tenant's rows only (the P8 tenant-scoped pattern, applied raw).
async function makeUniqueSlug(tenantId: string, base: string): Promise<string> {
  let slug = base || "product";
  let attempt = 0;
  while (true) {
    const existing = await prisma.product.findFirst({
      where: { tenantId, slug },
      select: { id: true },
    });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

interface CreateProductBody {
  name?: unknown;
  price?: unknown;
  description?: unknown;
}

export async function POST(
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

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  let body: CreateProductBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const errors: string[] = [];

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) errors.push("`name` is required.");

  const price = typeof body.price === "number" ? body.price : NaN;
  if (!Number.isFinite(price) || price <= 0) {
    errors.push("`price` must be a number greater than 0 (in dollars).");
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : undefined;

  if (errors.length) {
    return NextResponse.json({ error: "validation_failed", errors }, { status: 400 });
  }

  // Dollars → cents.
  const priceCents = Math.round(price * 100);

  const slug = await makeUniqueSlug(tenantId, generateSlug(name));

  const product = await prisma.product.create({
    data: {
      tenantId,
      name,
      slug,
      description: description || null,
      price: priceCents,
      status: ProductStatus.ACTIVE,
      // Default variant + zero-qty Inventory (ported from POST /api/admin/products).
      variants: {
        create: [
          {
            tenantId,
            name: "Default",
            optionValues: {},
            position: 0,
            inventory: {
              create: {
                tenantId,
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
    select: { id: true, slug: true, name: true, price: true },
  });

  return NextResponse.json(
    { id: product.id, slug: product.slug, name: product.name, priceCents: product.price },
    { status: 201 },
  );
}
