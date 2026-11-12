/**
 * mcp/tools/index.ts — every MCP tool, grouped by admin area.
 * Each area module exports `tools: McpTool[]` (reads and writes mixed); this
 * file splits them into the separate read / write registries.
 */
import type { McpTool } from "../kit";
import { tools as orders } from "./orders";

export const TOOL_AREAS: Record<string, McpTool[]> = {
  orders,
};

export const ALL_TOOLS: McpTool[] = Object.values(TOOL_AREAS).flat();
export const READ_TOOLS: McpTool[] = ALL_TOOLS.filter((t) => t.kind === "read");
export const WRITE_TOOLS: McpTool[] = ALL_TOOLS.filter((t) => t.kind !== "read");
