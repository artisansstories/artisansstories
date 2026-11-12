/**
 * mcp/tenant-flag.ts — per-store MCP on/off switch.
 *
 * ⚠️ MIGRATION-GATED. No existing column fits, so the flag lives in a NEW column
 * `StoreSettings."mcpEnabled" BOOLEAN NOT NULL DEFAULT false`, added by
 * `prisma/migrations/add_mcp_enabled.sql` — written but NOT APPLIED.
 *
 * The column is deliberately NOT in schema.prisma yet: adding it there would make
 * every generated `storeSettings` query SELECT a column that does not exist in
 * production until the migration runs. Instead we read/write it with raw SQL and
 * fail CLOSED: if the column is missing (migration not applied) or the query
 * errors for any reason, MCP is treated as OFF and the admin toggle is disabled
 * with an explanation. Once the migration is applied everywhere, add
 * `mcpEnabled Boolean @default(false)` to StoreSettings in schema.prisma and
 * swap these raw queries for the typed client.
 */
import { prisma } from "@/lib/prisma";

export interface TenantMcpFlag {
  /** False when the `mcpEnabled` column does not exist yet. */
  migrated: boolean;
  enabled: boolean;
}

function isMissingColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /mcpEnabled/i.test(msg) && /does not exist|42703/i.test(msg);
}

export async function getTenantMcpFlag(tenantId: string): Promise<TenantMcpFlag> {
  try {
    const rows = await prisma.$queryRaw<Array<{ mcpEnabled: boolean | null }>>`
      SELECT "mcpEnabled" FROM "StoreSettings" WHERE "tenantId" = ${tenantId} LIMIT 1`;
    return { migrated: true, enabled: rows[0]?.mcpEnabled === true };
  } catch (err) {
    if (isMissingColumn(err)) return { migrated: false, enabled: false };
    console.error("[mcp] failed to read tenant MCP flag:", err);
    return { migrated: true, enabled: false };
  }
}

export async function isTenantMcpEnabled(tenantId: string): Promise<boolean> {
  return (await getTenantMcpFlag(tenantId)).enabled;
}

export type SetFlagResult =
  | { ok: true; enabled: boolean }
  | { ok: false; reason: "not_migrated" | "no_settings_row" };

export async function setTenantMcpFlag(tenantId: string, enabled: boolean): Promise<SetFlagResult> {
  try {
    const count = await prisma.$executeRaw`
      UPDATE "StoreSettings" SET "mcpEnabled" = ${enabled} WHERE "tenantId" = ${tenantId}`;
    if (count === 0) return { ok: false, reason: "no_settings_row" };
    return { ok: true, enabled };
  } catch (err) {
    if (isMissingColumn(err)) return { ok: false, reason: "not_migrated" };
    throw err;
  }
}
