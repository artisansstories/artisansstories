/**
 * mcp/keys.ts — store-admin MCP key management (AI Assistants page).
 *
 * Reuses TenantApiKey + generateApiKey. Every query is pinned to the tenant
 * resolved from the admin session (TenantApiKey is a platform model, so it is
 * not auto-scoped — we filter by tenantId explicitly). Store admins can only
 * mint the `mcp:*` scopes; storefront scopes stay operator-only.
 */
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-key";
import type { McpScope } from "./tokens";

export type Assistant = "muse" | "grokbot";
export const ASSISTANT_NAMES: Record<Assistant, string> = { muse: "Muse", grokbot: "Grokbot" };

export interface McpKeyRow {
  id: string;
  name: string;
  prefix: string;
  scope: McpScope;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export async function listMcpKeys(tenantId: string): Promise<McpKeyRow[]> {
  const keys = await prisma.tenantApiKey.findMany({
    where: { tenantId, revokedAt: null, scopes: { hasSome: ["mcp:admin", "mcp:read"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, createdAt: true },
  });
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scope: k.scopes.includes("mcp:admin") ? "mcp:admin" : "mcp:read",
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt,
  }));
}

export async function mintMcpKey(tenantId: string, assistant: Assistant, scope: McpScope) {
  const generated = generateApiKey("live");
  const name = scope === "mcp:read" ? `${ASSISTANT_NAMES[assistant]} (read-only)` : ASSISTANT_NAMES[assistant];
  const created = await prisma.tenantApiKey.create({
    data: { tenantId, name, keyHash: generated.keyHash, prefix: generated.prefix, scopes: [scope] },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });
  return { ...created, scope, token: generated.raw };
}

/** Revoke an MCP key belonging to `tenantId`. Returns false if not found. */
export async function revokeMcpKey(tenantId: string, keyId: string): Promise<boolean> {
  const res = await prisma.tenantApiKey.updateMany({
    where: { id: keyId, tenantId, revokedAt: null, scopes: { hasSome: ["mcp:admin", "mcp:read"] } },
    data: { revokedAt: new Date() },
  });
  return res.count > 0;
}
