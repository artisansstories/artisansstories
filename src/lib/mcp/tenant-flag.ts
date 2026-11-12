/**
 * mcp/tenant-flag.ts — per-store MCP on/off switch.
 *
 * The flag is `StoreSettings.mcpEnabled` (default false), added by
 * `prisma/migrations/add_mcp.sql`. Reads fail CLOSED: if the column is missing
 * (migration not applied on this database) or the query errors for any other
 * reason, MCP is treated as OFF. The admin toggle uses `migrated` to explain
 * why it can't be turned on.
 */
import { prisma } from "@/lib/prisma";

export interface TenantMcpFlag {
  /** False when the `mcpEnabled` column does not exist on this database yet. */
  migrated: boolean;
  enabled: boolean;
}

function isMissingColumn(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "P2022") return true; // Prisma: column does not exist
  const msg = err instanceof Error ? err.message : String(err);
  return /mcpEnabled/i.test(msg) && /does not exist|42703/i.test(msg);
}

export async function getTenantMcpFlag(tenantId: string): Promise<TenantMcpFlag> {
  try {
    const row = await prisma.storeSettings.findUnique({
      where: { tenantId },
      select: { mcpEnabled: true },
    });
    return { migrated: true, enabled: row?.mcpEnabled === true };
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
    const { count } = await prisma.storeSettings.updateMany({
      where: { tenantId },
      data: { mcpEnabled: enabled },
    });
    if (count === 0) return { ok: false, reason: "no_settings_row" };
    return { ok: true, enabled };
  } catch (err) {
    if (isMissingColumn(err)) return { ok: false, reason: "not_migrated" };
    throw err;
  }
}
