import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import { createAdminSession } from "@/lib/admin-auth";

/**
 * POST /api/platform/tenants/[id]/impersonate — start an audited impersonation (P10)
 *
 * Operator-only (requirePlatformOperator). Mints a NORMAL `as-admin-session` JWT
 * scoped to the TARGET tenant, so all existing /admin + /api/admin tenant-scoping
 * "just works" — the minted session carries `tenantId: <target>`. It additionally
 * carries impersonation claims (`impersonatedBy`, `impersonatorEmail`) so the
 * store admin shell can surface an unmissable banner and offer "Exit".
 *
 * We prefer to impersonate a real SUPER_ADMIN of the tenant (then any active
 * admin); if the tenant has no admins at all, we mint a synthetic session bound
 * to the tenant directly — tenant scoping keys off the embedded `tenantId`, not
 * the admin row, so this is safe and still confined to that one store (P8).
 *
 * IMPORTANT: the operator's `as-platform-session` cookie is left intact so they
 * can return to /platform and stop impersonating.
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
    select: { id: true, name: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  // Prefer a SUPER_ADMIN of the tenant; fall back to any active admin; else a
  // synthetic session bound to the tenant.
  const target =
    (await prisma.adminUser.findFirst({
      where: { tenantId, role: "SUPER_ADMIN", isActive: true },
      select: { id: true, email: true, name: true, role: true },
    })) ??
    (await prisma.adminUser.findFirst({
      where: { tenantId, isActive: true },
      select: { id: true, email: true, name: true, role: true },
    }));

  const adminClaims = target
    ? { id: target.id, email: target.email, name: target.name, role: target.role }
    : {
        // Synthetic: no AdminUser exists for this tenant. Tenant scoping resolves
        // from the embedded tenantId, so a sentinel id is safe here.
        id: `impersonation:${tenantId}`,
        email: operator.email,
        name: `${operator.name} (operator)`,
        role: "SUPER_ADMIN",
      };

  // Audit the start BEFORE handing over the session.
  await prisma.platformAuditLog.create({
    data: {
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "impersonate.start",
      tenantId,
      detail: `impersonating "${tenant.name}" as ${adminClaims.email}${target ? "" : " (synthetic)"}`,
    },
  });

  // Mint a tenant-scoped admin session carrying the impersonation claims.
  await createAdminSession({
    ...adminClaims,
    tenantId,
    impersonatedBy: operator.id,
    impersonatorEmail: operator.email,
  });

  // Redirect into the store admin. The operator's platform session is untouched.
  return NextResponse.redirect(new URL("/admin", req.nextUrl.origin), { status: 303 });
}
