/**
 * mcp/server.ts — builds one fresh, stateless McpServer per request.
 *
 * Registries are separate (spec §8): read tools are always registered; write
 * tools are registered ONLY for `mcp:admin` credentials; house-only tools only
 * for the house tenant. A tool that isn't registered for this connection cannot
 * be called, whatever the model attempts.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import type { McpContext } from "./auth";
import type { McpTool, ToolCtx } from "./kit";
import { READ_TOOLS, WRITE_TOOLS } from "./tools";

export const SERVER_INSTRUCTIONS = `You are connected to one Artisans Stories store's admin. Every tool acts only on that store; the store is fixed by the credential and cannot be changed by any argument.

Tool tags: [Read] tools change nothing. [Write] tools change store data. [Sensitive write] tools email customers, move money (refunds, cancellations, payment capture), change the team, delete data, or publish content.

Every write is two calls. The first call (without confirmToken) returns a preview with the real effect: amounts, recipients, records affected. Nothing changes until the second call with the returned confirmToken.
- You cannot approve a refund, a cancellation, a customer email, or any other write on the user's behalf. Show the preview, wait for the user's explicit yes, then confirm.
- Never invent, reuse, or modify a confirmToken. If a confirm is blocked or expired, request a new preview and ask again.
- Report outcomes as they are: pending_confirmation (preview only), confirmed (done), or failed/blocked (not done, with the reason). If a write's outcome is unclear, check the record's current status with a read tool before retrying, so refunds, fulfillments and emails are not duplicated.
- A result with blocked: true is a permission or state boundary, not a transient error. Relay the reason; do not retry unless the guidance says so.
- Money amounts are integers in cents unless a field says otherwise.
- Do not speculate about other stores or about capabilities that aren't listed as tools.`;

function register(server: McpServer, tool: McpTool, ctx: ToolCtx) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputShape,
      annotations: tool.annotations,
    },
    // The SDK has already validated against inputShape; the kit re-parses.
    ((args: Record<string, unknown>) => tool.handler(ctx, args ?? {})) as never,
  );
}

export function toolsFor(ctx: Pick<McpContext, "scope" | "isHouse">): McpTool[] {
  const visible = (t: McpTool) => !t.houseOnly || ctx.isHouse;
  const tools = READ_TOOLS.filter(visible);
  if (ctx.scope === "mcp:admin") tools.push(...WRITE_TOOLS.filter(visible));
  return tools;
}

export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: "artisans-stories-admin", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS, capabilities: { tools: {} } },
  );
  const toolCtx: ToolCtx = { ...ctx, db: getTenantPrisma(ctx.tenantId) };
  for (const tool of toolsFor(ctx)) register(server, tool, toolCtx);
  return server;
}
