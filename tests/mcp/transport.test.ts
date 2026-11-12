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
import { __resetRateLimits, MCP_PER_CREDENTIAL } from "@/lib/mcp/rate-limit";
import * as mcpRoute from "@/app/api/mcp/route";
import * as mcpTokenRoute from "@/app/api/mcp/[token]/route";

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
  beforeEach(() => {
    verify.mockReset();
    __resetRateLimits();
  });

  it("401s with a resource_metadata pointer when the credential is missing/invalid", async () => {
    verify.mockResolvedValue({ ok: false, status: 401, error: "Missing credential" });
    const res = await handleMcpPost(rpc(INIT));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://store.test/.well-known/oauth-protected-resource"',
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toMatch(/WWW-Authenticate/i);
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

  it("adds CORS headers to successful JSON responses", async () => {
    verify.mockResolvedValue({ ok: true, ctx: ctx("mcp:admin") });
    const res = await handleMcpPost(rpc(INIT));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("accepts clients that send only Accept: application/json (or none)", async () => {
    verify.mockResolvedValue({ ok: true, ctx: ctx("mcp:admin") });
    for (const accept of ["application/json", "*/*", undefined]) {
      const req = rpc(INIT);
      const headers = new Headers(req.headers);
      if (accept) headers.set("accept", accept);
      else headers.delete("accept");
      const res = await handleMcpPost(new Request(req.url, { method: "POST", headers, body: JSON.stringify(INIT) }));
      expect(res.status, `accept=${accept}`).toBe(200);
      expect((await res.json()).result.serverInfo.name).toBe("artisans-stories-admin");
    }
  });

  it("rate-limits one credential with 429 + Retry-After before verifying it", async () => {
    verify.mockResolvedValue({ ok: true, ctx: ctx("mcp:admin") });
    for (let i = 0; i < MCP_PER_CREDENTIAL.limit; i++) {
      expect((await handleMcpPost(rpc(LIST, "oss_live_flood"))).status).toBe(200);
    }
    verify.mockClear();
    const res = await handleMcpPost(rpc(LIST, "oss_live_flood"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(verify).not.toHaveBeenCalled();
    // A different credential is unaffected.
    expect((await handleMcpPost(rpc(LIST, "oss_live_other"))).status).toBe(200);
  });
});

describe("/api/mcp route segment", () => {
  it("runs on Node with a 60s budget and is dynamic", () => {
    for (const mod of [mcpRoute, mcpTokenRoute]) {
      expect(mod.runtime).toBe("nodejs");
      expect(mod.maxDuration).toBe(60);
      expect(mod.dynamic).toBe("force-dynamic");
    }
  });

  it("GET and DELETE are 405 (stateless), OPTIONS is a CORS preflight", async () => {
    for (const mod of [mcpRoute, mcpTokenRoute]) {
      expect((await mod.GET()).status).toBe(405);
      expect((await mod.DELETE()).status).toBe(405);
      const pre = await mod.OPTIONS();
      expect(pre.status).toBe(204);
      const allow = pre.headers.get("access-control-allow-headers") ?? "";
      for (const h of ["Authorization", "Content-Type", "Mcp-Session-Id", "Mcp-Protocol-Version"]) {
        expect(allow).toContain(h);
      }
    }
  });
});
