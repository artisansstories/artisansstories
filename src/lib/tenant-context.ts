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
import { parseTenantHost, type HeaderCarrier } from "./tenant-host";

// Pure host helpers live in tenant-host.ts (dependency-free, shared with the
// proxy). Re-export them here so existing `@/lib/tenant-context` import sites
// keep working.
export {
  ROOT_DOMAIN,
  parseTenantHost,
  tenantBaseUrl,
  originFromRequest,
  type HostRouting,
  type HeaderCarrier,
} from "./tenant-host";

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
  // Fail CLOSED: an unresolvable/orphaned session must NOT silently serve
  // tenant-zero's data. Return null so getTenantPrismaForAdmin throws a 401.
  // A valid post-P2 session always embeds tenantId (handled above), so this
  // null path only affects malformed sessions — which should be rejected.
  return admin?.tenantId ?? null;
}

// ── Slug → tenantId LRU cache ────────────────────────────────────────────────
// A tiny in-memory cache so subdomain resolution doesn't hit the DB on every
// request. Map preserves insertion order, so the first key is the oldest — we
// evict it when over capacity (a poor-man's LRU; refreshed entries re-insert at
// the tail below). Per-process and best-effort: a stale/missing entry just costs
// one extra lookup, never correctness.
const SLUG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SLUG_CACHE_MAX = 500;
const slugCache = new Map<string, { tenantId: string; expiresAt: number }>();

function cacheGetTenantId(slug: string): string | null {
  const hit = slugCache.get(slug);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    slugCache.delete(slug);
    return null;
  }
  // Refresh recency: re-insert at the tail so the LRU eviction is meaningful.
  slugCache.delete(slug);
  slugCache.set(slug, hit);
  return hit.tenantId;
}

function cacheSetTenantId(slug: string, tenantId: string): void {
  slugCache.delete(slug);
  slugCache.set(slug, { tenantId, expiresAt: Date.now() + SLUG_CACHE_TTL_MS });
  while (slugCache.size > SLUG_CACHE_MAX) {
    const oldest = slugCache.keys().next().value;
    if (oldest === undefined) break;
    slugCache.delete(oldest);
  }
}

/** Test-only: drop all cached slug→tenantId entries. */
export function _clearTenantSlugCache(): void {
  slugCache.clear();
}

/**
 * Resolve a tenant from the request host. The apex / www domain (and dev
 * localhost) map to tenant zero; a `{slug}.artisansstories.com` subdomain is
 * resolved to its Tenant by slug (cached 5 min). An unknown subdomain slug
 * throws TenantResolutionError so the caller can 404/401 gracefully.
 */
export async function resolveTenantFromHost(
  req?: HeaderCarrier,
): Promise<string> {
  const host = req?.headers.get("host") ?? null;
  const routing = parseTenantHost(host);
  if (routing.kind === "root") return DEFAULT_TENANT_ID;

  const cached = cacheGetTenantId(routing.slug);
  if (cached) return cached;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: routing.slug },
    select: { id: true },
  });
  if (!tenant) {
    throw new TenantResolutionError(`Unknown tenant subdomain: ${routing.slug}`);
  }

  cacheSetTenantId(routing.slug, tenant.id);
  return tenant.id;
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
 * Resolve via host and return a tenant-scoped client. Maps the apex/www domain
 * (and dev localhost) to tenant zero; a `{slug}.artisansstories.com` subdomain
 * resolves to that tenant.
 * @throws TenantResolutionError if the host is a subdomain whose slug is unknown.
 */
export async function getTenantPrismaForHost(
  req?: HeaderCarrier,
): Promise<TenantPrisma> {
  const tenantId = await resolveTenantFromHost(req);
  return getTenantPrisma(tenantId);
}
