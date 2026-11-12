/**
 * mcp/auth.ts — per-request credential verification for /api/mcp (spec §2, §7).
 *
 * Two credential kinds, one context shape:
 *   - Tenant API key (`oss_live_…`) with scope `mcp:admin` or `mcp:read`.
 *   - OAuth access token (JWT) minted by /oauth/token.
 *
 * The tenant comes ONLY from the verified credential (key row / token claim).
 * Every request re-checks, live: platform switch on, tenant ACTIVE, key not
 * revoked, admin user still exists + active + same tenant, store MCP flag on.
 * Data access is injected through `AuthDeps` so the isolation rules are unit
 * testable without a database.
 */
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api-key";
import { isHouseTenant } from "@/lib/tenant-features";
import { mcpGloballyEnabled } from "./config";
import { isTenantMcpEnabled } from "./tenant-flag";
import { looksLikeApiKey, verifyAccessToken, type AccessClaims, type McpScope } from "./tokens";

export type McpPrincipal =
  | { kind: "key"; keyId: string; keyName: string }
  | { kind: "user"; userId: string; email: string };

export interface McpContext {
  tenantId: string;
  tenantSlug: string;
  scope: McpScope;
  /** Effective admin role. API keys act as ADMIN (never SUPER_ADMIN). */
  role: string;
  isHouse: boolean;
  principal: McpPrincipal;
  /** Stable id for audit rows (key id or AdminUser id). */
  actorId: string;
  /** Human label for audit rows. */
  actorLabel: string;
}

export type VerifyResult =
  | { ok: true; ctx: McpContext }
  | { ok: false; status: 401 | 403 | 404; error: string };

export interface AuthDeps {
  globallyEnabled(): boolean;
  findKeyByHash(keyHash: string): Promise<{
    id: string;
    name: string;
    tenantId: string;
    scopes: string[];
    revokedAt: Date | null;
  } | null>;
  touchKey(id: string): void;
  findTenant(id: string): Promise<{ id: string; slug: string; status: string } | null>;
  findAdminUser(id: string): Promise<{
    id: string;
    email: string;
    tenantId: string;
    isActive: boolean;
    role: string;
  } | null>;
  tenantMcpEnabled(tenantId: string): Promise<boolean>;
  verifyAccessToken(token: string): Promise<AccessClaims | null>;
}

export const defaultAuthDeps: AuthDeps = {
  globallyEnabled: mcpGloballyEnabled,
  findKeyByHash: (keyHash) =>
    prisma.tenantApiKey.findUnique({
      where: { keyHash },
      select: { id: true, name: true, tenantId: true, scopes: true, revokedAt: true },
    }),
  touchKey: (id) => {
    void prisma.tenantApiKey.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  },
  findTenant: (id) => prisma.tenant.findUnique({ where: { id }, select: { id: true, slug: true, status: true } }),
  // AdminUser is tenant-scoped, but here we look it up by its globally-unique id
  // and then REQUIRE its tenantId to equal the token's tenant claim.
  findAdminUser: (id) =>
    prisma.adminUser.findUnique({
      where: { id },
      select: { id: true, email: true, tenantId: true, isActive: true, role: true },
    }),
  tenantMcpEnabled: isTenantMcpEnabled,
  verifyAccessToken,
};

/** Highest MCP scope present on a key, or null when it has none. */
export function mcpScopeFromKeyScopes(scopes: string[]): McpScope | null {
  if (scopes.includes("mcp:admin")) return "mcp:admin";
  if (scopes.includes("mcp:read")) return "mcp:read";
  return null;
}

const DISABLED_MSG =
  "MCP access is turned off for this store. A store admin can turn it on in Admin → Settings → AI Assistants.";

async function tenantGate(
  deps: AuthDeps,
  tenantId: string,
): Promise<{ ok: true; slug: string } | { ok: false; status: 401 | 403; error: string }> {
  const tenant = await deps.findTenant(tenantId);
  if (!tenant) return { ok: false, status: 401, error: "Credential is not valid" };
  if (tenant.status !== "ACTIVE") return { ok: false, status: 403, error: "This store is not active" };
  if (!(await deps.tenantMcpEnabled(tenantId))) return { ok: false, status: 403, error: DISABLED_MSG };
  return { ok: true, slug: tenant.slug };
}

export async function verifyMcpCredential(
  token: string | null,
  deps: AuthDeps = defaultAuthDeps,
): Promise<VerifyResult> {
  // Platform switch off → behave as if the endpoint does not exist.
  if (!deps.globallyEnabled()) return { ok: false, status: 404, error: "Not found" };
  if (!token) return { ok: false, status: 401, error: "Missing credential" };

  if (looksLikeApiKey(token)) {
    const key = await deps.findKeyByHash(hashApiKey(token));
    if (!key || key.revokedAt) return { ok: false, status: 401, error: "Credential is not valid" };
    const scope = mcpScopeFromKeyScopes(key.scopes);
    if (!scope) return { ok: false, status: 401, error: "This key is not an MCP key" };
    const gate = await tenantGate(deps, key.tenantId);
    if (!gate.ok) return gate;
    deps.touchKey(key.id);
    return {
      ok: true,
      ctx: {
        tenantId: key.tenantId,
        tenantSlug: gate.slug,
        scope,
        role: "ADMIN",
        isHouse: isHouseTenant(key.tenantId),
        principal: { kind: "key", keyId: key.id, keyName: key.name },
        actorId: key.id,
        actorLabel: `mcp-key:${key.name}`,
      },
    };
  }

  const claims = await deps.verifyAccessToken(token);
  if (!claims) return { ok: false, status: 401, error: "Credential is not valid" };
  const user = await deps.findAdminUser(claims.sub);
  if (!user || !user.isActive || user.tenantId !== claims.tenantId) {
    return { ok: false, status: 401, error: "Credential is not valid" };
  }
  const gate = await tenantGate(deps, claims.tenantId);
  if (!gate.ok) return gate;
  return {
    ok: true,
    ctx: {
      tenantId: claims.tenantId,
      tenantSlug: gate.slug,
      scope: claims.scope,
      role: user.role,
      isHouse: isHouseTenant(claims.tenantId),
      principal: { kind: "user", userId: user.id, email: user.email },
      actorId: user.id,
      actorLabel: user.email,
    },
  };
}
