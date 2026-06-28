import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";

/**
 * PATCH /api/platform/tenants/[id]/admins/[adminId] — toggle an admin's access (T3)
 *
 * Operator-only. Sets AdminUser.isActive (deactivate to revoke store access, or
 * reactivate). The admin must belong to the tenant in the path (defense against
 * cross-tenant id tampering). Body: { isActive: boolean }.
 */
interface PatchBody {
  isActive?: unknown;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; adminId: string }> },
) {
  let operator;
  try {
    operator = await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id: tenantId, adminId } = await params;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.isActive !== "boolean") {
    return NextResponse.json(
      { error: "validation_failed", message: "`isActive` must be a boolean." },
      { status: 400 },
    );
  }

  // Scope the lookup to the tenant in the path so an operator can't flip an admin
  // belonging to a different store by guessing ids.
  const existing = await prisma.adminUser.findFirst({
    where: { id: adminId, tenantId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "admin_not_found" }, { status: 404 });
  }

  // No-op if already in the desired state — return current row, skip the audit.
  if (existing.isActive === body.isActive) {
    return NextResponse.json(existing);
  }

  const updated = await prisma.adminUser.update({
    where: { id: adminId },
    data: { isActive: body.isActive },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  await prisma.platformAuditLog.create({
    data: {
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: body.isActive ? "tenant.admin_reactivate" : "tenant.admin_deactivate",
      tenantId,
      detail: `${body.isActive ? "reactivated" : "deactivated"} admin ${existing.email}`,
    },
  });

  return NextResponse.json(updated);
}
