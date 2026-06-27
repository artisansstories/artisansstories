import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, platformAuthErrorResponse } from "@/lib/platform-auth";

/**
 * DELETE /api/platform/tenants/[id]/api-keys/[keyId] — revoke an API key (P6)
 *
 * Soft-revoke: sets `revokedAt`. The v1 resolver
 * (resolveTenantFromApiKey in src/lib/tenant-context.ts) already rejects any key
 * with a non-null `revokedAt`, so a revoked key stops authenticating immediately.
 * Idempotent: re-revoking an already-revoked key returns its existing revokedAt.
 *
 * AUTH: requirePlatformAdmin (platform-owner admin session).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> },
) {
  try {
    await requirePlatformAdmin(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id: tenantId, keyId } = await params;

  // Scope the lookup to the tenant so one tenant can't revoke another's key.
  const key = await prisma.tenantApiKey.findFirst({
    where: { id: keyId, tenantId },
    select: { id: true, revokedAt: true },
  });
  if (!key) {
    return NextResponse.json({ error: "key_not_found" }, { status: 404 });
  }

  if (key.revokedAt) {
    return NextResponse.json({ id: key.id, revoked: true, revokedAt: key.revokedAt });
  }

  const updated = await prisma.tenantApiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
    select: { id: true, revokedAt: true },
  });

  return NextResponse.json({ id: updated.id, revoked: true, revokedAt: updated.revokedAt });
}
