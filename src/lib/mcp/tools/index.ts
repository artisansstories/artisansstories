/**
 * mcp/tools/index.ts — every MCP tool, grouped by admin area.
 * Each area module exports `tools: McpTool[]` (reads and writes mixed); this
 * file splits them into the separate read / write registries.
 */
import type { McpTool } from "../kit";
import { tools as admin } from "./admin";
import { tools as orders } from "./orders";
import { tools as returns } from "./returns";
import { tools as catalog } from "./catalog";
import { tools as commerce } from "./commerce";
import { tools as content } from "./content";
import { tools as storefront } from "./storefront";

export const TOOL_AREAS: Record<string, McpTool[]> = {
  admin,
  orders,
  returns,
  catalog,
  commerce,
  content,
  storefront,
};

export const ALL_TOOLS: McpTool[] = Object.values(TOOL_AREAS).flat();
export const READ_TOOLS: McpTool[] = ALL_TOOLS.filter((t) => t.kind === "read");
export const WRITE_TOOLS: McpTool[] = ALL_TOOLS.filter((t) => t.kind !== "read");
