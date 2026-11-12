/**
 * mcp/audit.ts — attribution for every MCP write.
 *
 * Reuses PlatformAuditLog (append-only, platform-global). For MCP rows:
 *   operatorId    → the key id or AdminUser id that made the call
 *   operatorEmail → admin email, or `mcp-key:<key name>`
 *   action        → `mcp.<tool_name>`
 *   tenantId      → the tenant from the verified credential
 *   detail        → JSON { via: "mcp", principal, args, outcome }
 * `via` comes from the verified credential, never from a client header.
 * Never throws: an audit failure must not fail or roll back the write.
 */
import { prisma } from "@/lib/prisma";
import type { McpContext } from "./auth";

const MAX_DETAIL = 4000;

export async function auditMcpWrite(
  ctx: McpContext,
  tool: string,
  args: unknown,
  outcome: "confirmed" | "failed",
  summary?: unknown,
): Promise<void> {
  try {
    let detail = JSON.stringify({
      via: "mcp",
      principal: ctx.principal,
      scope: ctx.scope,
      args,
      outcome,
      summary,
    });
    if (detail.length > MAX_DETAIL) detail = detail.slice(0, MAX_DETAIL - 1) + "…";
    await prisma.platformAuditLog.create({
      data: {
        operatorId: ctx.actorId,
        operatorEmail: ctx.actorLabel,
        action: `mcp.${tool}`,
        tenantId: ctx.tenantId,
        detail,
      },
    });
  } catch (err) {
    console.error("[mcp] audit log write failed:", err);
  }
}
