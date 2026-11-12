import { describe, it, expect, vi } from "vitest";
import { verifyMcpCredential, type AuthDeps } from "@/lib/mcp/auth";
import { hashApiKey } from "@/lib/api-key";
import { signAccessToken, verifyAccessToken } from "@/lib/mcp/tokens";
import { ALL_TOOLS } from "@/lib/mcp/tools";
import type { ToolCtx } from "@/lib/mcp/kit";

const KEY_A = "oss_live_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const KEY_B = "oss_live_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const KEY_STORE = "oss_live_SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS";
const KEY_REVOKED = "oss_live_RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR";

function makeDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  const keys: Record<string, { id: string; name: string; tenantId: string; scopes: string[]; revokedAt: Date | null }> = {
    [hashApiKey(KEY_A)]: { id: "key_a", name: "Muse", tenantId: "tenant_a", scopes: ["mcp:admin"], revokedAt: null },
    [hashApiKey(KEY_B)]: { id: "key_b", name: "Grokbot", tenantId: "tenant_b", scopes: ["mcp:read"], revokedAt: null },
    [hashApiKey(KEY_STORE)]: { id: "key_s", name: "Storefront", tenantId: "tenant_a", scopes: ["store:read", "store:write"], revokedAt: null },
    [hashApiKey(KEY_REVOKED)]: { id: "key_r", name: "Old", tenantId: "tenant_a", scopes: ["mcp:admin"], revokedAt: new Date() },
  };
  const tenants: Record<string, { id: string; slug: string; status: string }> = {
    tenant_a: { id: "tenant_a", slug: "a", status: "ACTIVE" },
    tenant_b: { id: "tenant_b", slug: "b", status: "ACTIVE" },
    tenant_s: { id: "tenant_s", slug: "s", status: "SUSPENDED" },
  };
  const users: Record<string, { id: string; email: string; tenantId: string; isActive: boolean; role: string }> = {
    user_a: { id: "user_a", email: "anna@a.test", tenantId: "tenant_a", isActive: true, role: "SUPER_ADMIN" },
    user_b: { id: "user_b", email: "bob@b.test", tenantId: "tenant_b", isActive: true, role: "EDITOR" },
    user_off: { id: "user_off", email: "off@a.test", tenantId: "tenant_a", isActive: false, role: "ADMIN" },
  };
  return {
    globallyEnabled: () => true,
    findKeyByHash: async (h) => keys[h] ?? null,
    touchKey: () => {},
    findTenant: async (id) => tenants[id] ?? null,
    findAdminUser: async (id) => users[id] ?? null,
    tenantMcpEnabled: async (id) => id !== "tenant_off",
    verifyAccessToken,
    ...overrides,
  };
}

describe("tenant comes only from the verified credential", () => {
  it("a key for tenant A yields a tenant-A context (and B for B)", async () => {
    const a = await verifyMcpCredential(KEY_A, makeDeps());
    const b = await verifyMcpCredential(KEY_B, makeDeps());
    expect(a.ok && a.ctx.tenantId).toBe("tenant_a");
    expect(a.ok && a.ctx.scope).toBe("mcp:admin");
    expect(a.ok && a.ctx.role).toBe("ADMIN");
    expect(b.ok && b.ctx.tenantId).toBe("tenant_b");
    expect(b.ok && b.ctx.scope).toBe("mcp:read");
  });

  it("an OAuth token for user A in tenant A works; the same user claimed for tenant B is rejected", async () => {
    const good = await signAccessToken({ sub: "user_a", tenantId: "tenant_a", scope: "mcp:admin" });
    const forged = await signAccessToken({ sub: "user_a", tenantId: "tenant_b", scope: "mcp:admin" });
    const r1 = await verifyMcpCredential(good, makeDeps());
    expect(r1.ok && r1.ctx.tenantId).toBe("tenant_a");
    expect(r1.ok && r1.ctx.role).toBe("SUPER_ADMIN");
    const r2 = await verifyMcpCredential(forged, makeDeps());
    expect(r2).toEqual({ ok: false, status: 401, error: "Credential is not valid" });
  });

  it("rejects revoked keys, non-MCP keys, unknown keys, deleted/inactive users", async () => {
    expect((await verifyMcpCredential(KEY_REVOKED, makeDeps())).ok).toBe(false);
    expect((await verifyMcpCredential(KEY_STORE, makeDeps())).ok).toBe(false);
    expect((await verifyMcpCredential("oss_live_unknownunknownunknown", makeDeps())).ok).toBe(false);
    const gone = await signAccessToken({ sub: "user_gone", tenantId: "tenant_a", scope: "mcp:admin" });
    expect((await verifyMcpCredential(gone, makeDeps())).ok).toBe(false);
    const off = await signAccessToken({ sub: "user_off", tenantId: "tenant_a", scope: "mcp:admin" });
    expect((await verifyMcpCredential(off, makeDeps())).ok).toBe(false);
    expect((await verifyMcpCredential("garbage.jwt.value", makeDeps())).ok).toBe(false);
    expect((await verifyMcpCredential(null, makeDeps()))).toMatchObject({ ok: false, status: 401 });
  });

  it("fails closed on live gates: platform switch, tenant status, store flag", async () => {
    expect(await verifyMcpCredential(KEY_A, makeDeps({ globallyEnabled: () => false }))).toMatchObject({ status: 404 });
    expect(
      await verifyMcpCredential(KEY_A, makeDeps({ findTenant: async () => ({ id: "tenant_a", slug: "a", status: "SUSPENDED" }) })),
    ).toMatchObject({ ok: false, status: 403 });
    expect(await verifyMcpCredential(KEY_A, makeDeps({ tenantMcpEnabled: async () => false }))).toMatchObject({ ok: false, status: 403 });
  });
});

describe("no tool can be pointed at another tenant", () => {
  it("no tool input schema has a tenant field", () => {
    for (const tool of ALL_TOOLS) {
      for (const field of Object.keys(tool.inputShape)) {
        expect(/tenant/i.test(field), `${tool.name}.${field}`).toBe(false);
      }
    }
  });

  it("a smuggled tenantId argument is ignored; the handler only uses ctx.db (tenant A)", async () => {
    const findUnique = vi.fn(async () => null);
    const findFirst = vi.fn(async () => ({ id: "order_1" }));
    const fakeDb = { $tenantId: "tenant_a", order: { findUnique, findFirst } };
    const ctx = {
      tenantId: "tenant_a",
      tenantSlug: "a",
      scope: "mcp:admin",
      role: "ADMIN",
      isHouse: false,
      principal: { kind: "key", keyId: "key_a", keyName: "Muse" },
      actorId: "key_a",
      actorLabel: "mcp-key:Muse",
      db: fakeDb,
    } as unknown as ToolCtx;
    const tool = ALL_TOOLS.find((t) => t.name === "orders_get");
    expect(tool).toBeDefined();
    const res = await tool!.handler(ctx, { orderNumber: "AS-1", tenantId: "tenant_b" });
    const calls = [...findFirst.mock.calls, ...findUnique.mock.calls] as unknown as Array<[{ where: Record<string, unknown> }]>;
    expect(calls.length).toBeGreaterThan(0);
    for (const [args] of calls) expect(JSON.stringify(args)).not.toContain("tenant_b");
    expect(JSON.parse((res.content[0] as { text: string }).text)).toMatchObject({ blocked: true, status: 404 });
  });
});
