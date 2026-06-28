import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";

/**
 * /api/platform/tenants/[id]/go-live — publish / un-publish a tenant store (O1)
 *
 *   POST   → re-validate prerequisites (stripeOnboarded && productCount > 0) and
 *            flip the tenant's OWN StoreSettings.storeEnabled = true. 409 with the
 *            unmet list otherwise.
 *   DELETE → un-publish (storeEnabled = false) for symmetry.
 *
 * Closes the "no operator-callable go-live" gap: storeEnabled lives on
 * StoreSettings, previously flipped only via the store-admin `PUT /api/admin/settings`.
 * Each action writes a PlatformAuditLog row (consistent with impersonation logging).
 *
 * AUTH: requirePlatformOperator — operator `as-platform-session` cookie (P10).
 */

export async function POST(
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

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, stripeOnboarded: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const productCount = await prisma.product.count({ where: { tenantId } });

  // Re-validate prerequisites server-side (the gate that actually matters).
  const missing: string[] = [];
  if (!tenant.stripeOnboarded) missing.push("stripe");
  if (productCount === 0) missing.push("products");
  if (missing.length) {
    return NextResponse.json(
      { error: "prerequisites_unmet", missing },
      { status: 409 },
    );
  }

  // Flip the tenant's own StoreSettings.storeEnabled (upsert if the row is absent).
  await prisma.storeSettings.upsert({
    where: { tenantId },
    update: { storeEnabled: true },
    create: { tenantId, storeName: tenant.name, storeEnabled: true },
  });

  await prisma.platformAuditLog.create({
    data: {
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "go-live",
      tenantId,
      detail: `published "${tenant.name}"`,
    },
  });

  return NextResponse.json({ storeEnabled: true });
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

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  await prisma.storeSettings.upsert({
    where: { tenantId },
    update: { storeEnabled: false },
    create: { tenantId, storeName: tenant.name, storeEnabled: false },
  });

  await prisma.platformAuditLog.create({
    data: {
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "go-live.revert",
      tenantId,
      detail: `un-published "${tenant.name}"`,
    },
  });

  return NextResponse.json({ storeEnabled: false });
}
