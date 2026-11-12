import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";

// Mock only credential verification; the real transport + server + registry run.
const verify = vi.fn();
vi.mock("@/lib/mcp/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/mcp/auth")>()),
  verifyMcpCredential: (...a: unknown[]) => verify(...a),
}));

import { handleMcpPost } from "@/lib/mcp/http";
import { ALL_TOOLS } from "@/lib/mcp/tools";

const ctx = (scope: "mcp:admin" | "mcp:read", isHouse = false): McpContext => ({
  tenantId: "tenant_a",
  tenantSlug: "a",
  scope,
  role: "ADMIN",
  isHouse,
  principal: { kind: "key", keyId: "key_a", keyName: "Muse" },
  actorId: "key_a",
  actorLabel: "mcp-key:Muse",
});

function rpc(body: unknown, token = "oss_live_test", path?: string) {
  return new Request(`https://store.test/api/mcp${path ? `/${path}` : ""}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      host: "store.test",
      "x-forwarded-proto": "https",
      ...(path ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
};
const LIST = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };

describe("Streamable HTTP endpoint (stateless)", () => {
  beforeEach(() => verify.mockReset());

  it("401s with a resource_metadata pointer when the credential is missing/invalid", async () => {
    verify.mockResolvedValue({ ok: false, status: 401, error: "Missing credential" });
    const res = await handleMcpPost(rpc(INIT));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://store.test/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it("404s when the platform switch is off", async () => {
    verify.mockResolvedValue({ ok: false, status: 404, error: "Not found" });
    expect((await handleMcpPost(rpc(INIT))).status).toBe(404);
  });

  it("initialize returns server info + instructions", async () => {
    verify.mockResolvedValue({ ok: true, ctx: ctx("mcp:admin") });
    const res = await handleMcpPost(rpc(INIT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("artisans-stories-admin");
    expect(body.result.instructions).toMatch(/cannot approve a refund/i);
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });

  it("tools/list: full key sees reads + writes (minus house-only), with annotations", async () => {
    verify.mockResolvedValue({ ok: true, ctx: ctx("mcp:admin") });
    const body = await (await handleMcpPost(rpc(LIST))).json();
    const names: string[] = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("orders_refund");
    expect(names).not.toContain("landing_page_update");
    expect(names.length).toBe(ALL_TOOLS.filter((t) => !t.houseOnly).length);
    const refund = body.result.tools.find((t: { name: string }) => t.name === "orders_refund");
    expect(refund.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
    expect(refund.description.startsWith("[Sensitive write]")).toBe(true);
    expect(Object.keys(refund.inputSchema.properties)).toContain("confirmToken");
  });

  it("tools/list: read-only key sees only [Read] tools", async () => {
    verify.mockResolvedValue({ ok: true, ctx: ctx("mcp:read", true) });
    const body = await (await handleMcpPost(rpc(LIST))).json();
    const tools: Array<{ name: string; description: string; annotations: { readOnlyHint: boolean } }> = body.result.tools;
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((t) => t.description.startsWith("[Read]") && t.annotations.readOnlyHint)).toBe(true);
  });

  it("calling an unregistered write tool with a read-only key fails at the protocol layer", async () => {
    verify.mockResolvedValue({ ok: true, ctx: ctx("mcp:read") });
    const call = { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "orders_refund", arguments: { orderId: "o1" } } };
    const body = await (await handleMcpPost(rpc(call))).json();
    const text = JSON.stringify(body);
    expect(text).toMatch(/not found/i);
    expect(text).not.toMatch(/pending_confirmation/);
  });

  it("passes the URL-path token through to verification (header absent)", async () => {
    verify.mockResolvedValue({ ok: true, ctx: ctx("mcp:admin") });
    await handleMcpPost(rpc(INIT, undefined, "oss_live_path%20token"), "oss_live_path%20token");
    expect(verify).toHaveBeenCalledWith("oss_live_pathtoken");
  });
});
