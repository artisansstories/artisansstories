import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";

/**
 * GET /api/platform/api-keys — cross-tenant key inventory (A7 / P1-5)
 *
 * Read-only roll-up of every TenantApiKey across all tenants, so an operator can
 * see the whole key surface in one place instead of opening each tenant. Minting
 * and per-tenant management stay on the tenant pages; revoke-from-here is a later
 * nicety (noted as deferred).
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

  // Keys carry a real FK to Tenant — join the tenant label directly. Active keys
  // (revokedAt null) first, then newest first within each group.
  const keys = await prisma.tenantApiKey.findMany({
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      tenant: { select: { id: true, slug: true, name: true } },
    },
  });

  const activeCount = keys.filter((k) => !k.revokedAt).length;

  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      createdAt: k.createdAt,
      tenantId: k.tenant.id,
      tenantName: k.tenant.name,
      tenantSlug: k.tenant.slug,
    })),
    counts: { total: keys.length, active: activeCount, revoked: keys.length - activeCount },
  });
}
