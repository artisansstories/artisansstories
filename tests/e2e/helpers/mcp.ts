/**
 * Drive the real MCP server in-process: the SDK client speaks Streamable HTTP to
 * the actual /api/mcp route handler (same code path production serves), with a
 * real key row from the seeded database.
 */
import { expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { POST } from "@/app/api/mcp/route";

export interface Mcp {
  client: Client;
  /** Call a tool and parse its JSON text result. */
  call(name: string, args?: Record<string, unknown>): Promise<any>;
  /** Raw CallToolResult (for isError checks). */
  raw(name: string, args?: Record<string, unknown>): Promise<any>;
  toolNames(): Promise<string[]>;
  close(): Promise<void>;
}

export async function connectMcp(key: string): Promise<Mcp> {
  const transport = new StreamableHTTPClientTransport(new URL("https://artisansstories.com/api/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
    fetch: async (input: string | URL | Request, init?: RequestInit) => POST(new Request(input, init)),
  });
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(transport);
  const raw = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
  return {
    client,
    raw,
    async call(name, args = {}) {
      const res = (await raw(name, args)) as { content: { type: string; text: string }[]; isError?: boolean };
      const text = res.content?.[0]?.text ?? "";
      try {
        return JSON.parse(text);
      } catch {
        return { __text: text, isError: res.isError };
      }
    },
    async toolNames() {
      const { tools } = await client.listTools();
      return tools.map((t) => t.name).sort();
    },
    close: () => client.close(),
  };
}

export interface WriteFlow {
  preview: any;
  confirmed: any;
  replay: any;
}

/**
 * preview → (snapshot check) → confirm → replay. `between` runs after the
 * preview so the caller can assert the database did NOT change yet.
 */
export async function previewConfirmReplay(mcp: Mcp, tool: string, args: Record<string, unknown>, between?: (preview: any) => Promise<void> | void): Promise<WriteFlow> {
  const preview = await mcp.call(tool, args);
  expect(preview, `${tool} preview: ${JSON.stringify(preview)}`).toMatchObject({ status: "pending_confirmation", done: false });
  expect(typeof preview.confirmToken).toBe("string");
  if (between) await between(preview);
  const confirmed = await mcp.call(tool, { ...args, confirmToken: preview.confirmToken });
  const replay = await mcp.call(tool, { ...args, confirmToken: preview.confirmToken });
  return { preview, confirmed, replay };
}

/** The replay of a used confirm token must be refused, never executed. */
export function expectReplayBlocked(flow: WriteFlow): void {
  expect(flow.replay, JSON.stringify(flow.replay)).toMatchObject({ done: false, blocked: true });
}

export function expectConfirmed(flow: WriteFlow): any {
  expect(flow.confirmed, JSON.stringify(flow.confirmed)).toMatchObject({ done: true, status: "confirmed" });
  return flow.confirmed.result;
}
