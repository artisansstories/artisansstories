/**
 * tenant-context.ts — Tenant resolution layer (P2)
 *
 * Maps an incoming request to a `tenantId` via three independent strategies and
 * hands back a tenant-SCOPED Prisma client. Today there is exactly one tenant
 * (tenant zero = Artisans Stories), so host resolution always returns it and
 * behavior is identical to pre-multitenancy. Subdomain/path/custom-domain
 * resolution arrives in a later phase.
 *
 *   - API key      → Authorization: Bearer <token>  (storefront API)
 *   - Admin session→ as-admin-session cookie         (admin dashboard)
 *   - Host         → request host / default domain   (public storefront)
 */
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { getAdminSession } from "./admin-auth";
import { hashApiKey } from "./api-key";
import { getTenantPrisma, type TenantPrisma } from "./tenant-prisma";

/** Platform-owner ("tenant zero") id — the live Artisans Stories data. */
export const DEFAULT_TENANT_ID = "tenant_artisans_stories";

/** Thrown when a request cannot be mapped to a tenant. Maps to HTTP 401. */
export class TenantResolutionError extends Error {
  readonly status = 401;
  constructor(message = "Unable to resolve tenant for request") {
    super(message);
    this.name = "TenantResolutionError";
  }
}

export interface ApiKeyTenant {
  tenantId: string;
  scopes: string[];
}

/** Minimal request shape we need — anything with a `headers.get(name)`. */
type HeaderCarrier = { headers: { get(name: string): string | null } };

/**
 * Resolve a tenant from an `Authorization: Bearer <token>` API key.
 * Returns null when no/invalid/revoked key is present. Updates `lastUsedAt`
 * best-effort (fire-and-forget; never blocks or fails the request).
 */
export async function resolveTenantFromApiKey(
  req: HeaderCarrier,
): Promise<ApiKeyTenant | null> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  const keyHash = hashApiKey(token);
  const key = await prisma.tenantApiKey.findUnique({
    where: { keyHash },
    select: { id: true, tenantId: true, scopes: true, revokedAt: true },
  });
  if (!key || key.revokedAt) return null;

  // Best-effort usage timestamp — never block or throw on this.
  void prisma.tenantApiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { tenantId: key.tenantId, scopes: key.scopes };
}

/**
 * Resolve the tenant for the current admin session (as-admin-session cookie).
 * The session JWT may not carry a tenantId (older tokens), so we fall back to
 * looking up the AdminUser. Returns null only when there is NO valid session.
 */
export async function resolveTenantFromAdminSession(
  _req?: HeaderCarrier,
): Promise<string | null> {
  const session = await getAdminSession();
  if (!session) return null;

  // Prefer a tenantId embedded in the session token when present.
  const embedded = (session as { tenantId?: string }).tenantId;
  if (embedded) return embedded;

  // Otherwise derive it from the AdminUser record (id is globally unique).
  const admin = await prisma.adminUser.findUnique({
    where: { id: session.id },
    select: { tenantId: true },
  });
  // A logged-in admin always belongs to a tenant; default to tenant zero only
  // as a single-tenant safety net if the row can't be read.
  return admin?.tenantId ?? DEFAULT_TENANT_ID;
}

/**
 * Resolve a tenant from the request host. For now the primary domain always
 * maps to tenant zero, preserving Artisans Stories behavior. Subdomain / path /
 * custom-domain resolution will extend this later.
 */
export function resolveTenantFromHost(_req?: HeaderCarrier): string {
  return DEFAULT_TENANT_ID;
}

/**
 * Resolve via admin session and return a tenant-scoped client.
 * @throws TenantResolutionError (401) if there is no admin session.
 */
export async function getTenantPrismaForAdmin(
  req?: HeaderCarrier,
): Promise<TenantPrisma> {
  const tenantId = await resolveTenantFromAdminSession(req);
  if (!tenantId) throw new TenantResolutionError("No admin session");
  return getTenantPrisma(tenantId);
}

/**
 * Resolve via API key and return a tenant-scoped client (+ scopes).
 * @throws TenantResolutionError (401) if the key is missing/invalid/revoked.
 */
export async function getTenantPrismaForApiKey(
  req: HeaderCarrier,
): Promise<{ db: TenantPrisma; tenantId: string; scopes: string[] }> {
  const resolved = await resolveTenantFromApiKey(req);
  if (!resolved) throw new TenantResolutionError("Invalid or missing API key");
  return { db: getTenantPrisma(resolved.tenantId), tenantId: resolved.tenantId, scopes: resolved.scopes };
}

/**
 * Resolve via host and return a tenant-scoped client. Always succeeds today
 * (maps to tenant zero); kept async for symmetry and future host lookups.
 */
export async function getTenantPrismaForHost(
  req?: HeaderCarrier,
): Promise<TenantPrisma> {
  const tenantId = resolveTenantFromHost(req);
  return getTenantPrisma(tenantId);
}
