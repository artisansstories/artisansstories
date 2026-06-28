import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";

/**
 * GET /api/platform/audit-log — surface PlatformAuditLog (A7 / P2-5)
 *
 * The audit trail is WRITTEN across the console (impersonate.start/stop, go-live,
 * tenant.archive/suspend/reactivate/delete) but was never readable until now.
 * This endpoint exposes it read-only to operators.
 *
 *   ?tenantId=<id>   filter to one target tenant (the tenant-detail "Recent
 *                    activity" section uses this).
 *   ?action=<name>   filter to one action string (exact match).
 *   ?limit=<n>       cap rows (default 100, hard max 200) — newest first.
 *
 * Tenant slugs/names are resolved in one batched query so the table can show a
 * human label instead of a bare id. A tenant that was hard-deleted leaves audit
 * rows whose tenantId no longer resolves (PlatformAuditLog.tenantId is a nullable
 * string, not an FK) — those simply render with the raw id, which is intended:
 * the trail must outlive the tenant.
 *
 * AUTH: requirePlatformOperator — operator `as-platform-session` cookie.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const sp = req.nextUrl?.searchParams;

  const tenantId = sp?.get("tenantId")?.trim() || undefined;
  const action = sp?.get("action")?.trim() || undefined;

  // Cap rows so the table stays bounded; default 100, hard ceiling 200.
  const limitRaw = Number.parseInt(sp?.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;

  const where: { tenantId?: string; action?: string } = {};
  if (tenantId) where.tenantId = tenantId;
  if (action) where.action = action;

  const rows = await prisma.platformAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      operatorEmail: true,
      action: true,
      tenantId: true,
      detail: true,
      createdAt: true,
    },
  });

  // Resolve target-tenant labels in one batched query (slug/name) for the rows
  // whose tenant still exists. Deleted tenants resolve to nothing → raw id shown.
  const ids = [...new Set(rows.map((r) => r.tenantId).filter((x): x is string => !!x))];
  const tenants = ids.length
    ? await prisma.tenant.findMany({
        where: { id: { in: ids } },
        select: { id: true, slug: true, name: true },
      })
    : [];
  const byId = new Map(tenants.map((t) => [t.id, t]));

  return NextResponse.json({
    entries: rows.map((r) => {
      const t = r.tenantId ? byId.get(r.tenantId) : undefined;
      return {
        id: r.id,
        operatorEmail: r.operatorEmail,
        action: r.action,
        tenantId: r.tenantId,
        tenantSlug: t?.slug ?? null,
        tenantName: t?.name ?? null,
        detail: r.detail,
        createdAt: r.createdAt,
      };
    }),
    limit,
  });
}
