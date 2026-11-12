/**
 * AI Assistants admin: /api/admin/mcp (GET/PATCH), /api/admin/mcp/keys (POST),
 * /api/admin/mcp/keys/[keyId] (DELETE). Every effect is proven against the real
 * MCP server: a minted key connects, a revoked key or a store with MCP turned
 * off cannot.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api-key";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp } from "../helpers/mcp";
import * as mcpRoute from "@/app/api/admin/mcp/route";
import * as keysRoute from "@/app/api/admin/mcp/keys/route";
import * as keyIdRoute from "@/app/api/admin/mcp/keys/[keyId]/route";

/* eslint-disable @typescript-eslint/no-explicit-any */

const getMcp = (host?: string) => call(mcpRoute.GET as never, "GET", "/api/admin/mcp", { host });
const patchMcp = (body: unknown) => call(mcpRoute.PATCH as never, "PATCH", "/api/admin/mcp", { body });
const mint = (body: unknown, host?: string) => call(keysRoute.POST as never, "POST", "/api/admin/mcp/keys", { body, host });
const revoke = (keyId: string) => call(keyIdRoute.DELETE as never, "DELETE", `/api/admin/mcp/keys/${keyId}`, { params: { keyId } });

/** Connect, run one read, close. Throws if the server refuses the credential. */
async function mcpTotalOrders(key: string): Promise<number> {
  const mcp = await connectMcp(key);
  try {
    return (await mcp.call("dashboard_summary")).stats.totalOrders;
  } finally {
    await mcp.close();
  }
}

/** The server's refusal of `connectMcp(key)`: HTTP status (SDK error .code) and message. */
async function connectRefusal(key: string): Promise<{ status: unknown; message: string }> {
  try {
    const mcp = await connectMcp(key);
    await mcp.close();
  } catch (err: any) {
    return { status: err?.code, message: String(err?.message) };
  }
  throw new Error("expected the MCP server to refuse this credential");
}

describe("GET /api/admin/mcp", () => {
  it("401 without a session, and for a deactivated admin's session", async () => {
    expect((await getMcp()).status).toBe(401);
    await signInAs(F.admin.inactive);
    expect((await getMcp()).status).toBe(401);
  });

  it("shows the switch and only this store's MCP keys (no secrets)", async () => {
    await signInAs(F.admin.super);
    const r = await getMcp();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ globallyEnabled: true, migrated: true, enabled: true, canManage: true });
    expect(r.body.mcpUrl).toMatch(/^https?:\/\/artisansstories\.com\/api\/mcp$/);
    expect(r.body.keys.map((k: any) => k.id).sort()).toEqual([F.key.houseAdmin, F.key.houseRead].sort()); // storefront key excluded
    expect(r.body.keys.find((k: any) => k.id === F.key.houseRead)).toMatchObject({ name: "Grokbot (read-only)", scope: "mcp:read", prefix: KEYS.houseRead.slice(0, 12) });
    expect(r.text).not.toContain("keyHash");
    expect(r.text).not.toContain(KEYS.houseAdmin);
  });

  it("EDITOR can view but canManage is false; other store sees its own keys on its host", async () => {
    await signInAs(F.admin.editor);
    const e = await getMcp();
    expect(e.status).toBe(200);
    expect(e.body.canManage).toBe(false);

    await signInAs(F.admin.oSuper);
    const o = await getMcp("other-store.artisansstories.com");
    expect(o.body.mcpUrl).toMatch(/^https?:\/\/other-store\.artisansstories\.com\/api\/mcp$/);
    expect(o.body.keys.map((k: any) => k.id).sort()).toEqual([F.key.otherAdmin, F.key.otherRead].sort());
  });
});

describe("PATCH /api/admin/mcp", () => {
  it("401 without a session; EDITOR 403; bad body 400 — flag unchanged", async () => {
    expect((await patchMcp({ enabled: false })).status).toBe(401);
    await signInAs(F.admin.editor);
    expect(await patchMcp({ enabled: false })).toMatchObject({ status: 403, body: { error: "Only store admins can change this" } });
    await signInAs(F.admin.admin);
    expect((await patchMcp({ enabled: "no" })).status).toBe(400);
    expect((await prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: HOUSE } })).mcpEnabled).toBe(true);
  });

  it("ADMIN turns MCP off: valid keys are refused with 403; other store unaffected; back on works", async () => {
    await signInAs(F.admin.admin);
    expect(await patchMcp({ enabled: false })).toMatchObject({ status: 200, body: { enabled: false } });
    expect((await prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: HOUSE } })).mcpEnabled).toBe(false);
    expect((await getMcp()).body.enabled).toBe(false);

    expect(await connectRefusal(KEYS.houseAdmin)).toEqual({ status: 403, message: expect.stringContaining("MCP access is turned off for this store") });
    expect(await connectRefusal(KEYS.houseRead)).toMatchObject({ status: 403 });
    expect(await mcpTotalOrders(KEYS.otherAdmin)).toBe(1);

    expect(await patchMcp({ enabled: true })).toMatchObject({ status: 200, body: { enabled: true } });
    expect(await mcpTotalOrders(KEYS.houseAdmin)).toBe(11);
  });

  it("409 when the store has no settings row yet", async () => {
    await prisma.storeSettings.delete({ where: { tenantId: OTHER } });
    await signInAs(F.admin.oSuper);
    const r = await patchMcp({ enabled: true });
    expect(r).toMatchObject({ status: 409, body: { reason: "no_settings_row" } });
  });
});

describe("POST /api/admin/mcp/keys", () => {
  it("401 without a session; EDITOR 403; bad input 400 — no key created", async () => {
    const before = await prisma.tenantApiKey.count();
    expect((await mint({ assistant: "muse", access: "full" })).status).toBe(401);
    await signInAs(F.admin.editor);
    expect(await mint({ assistant: "muse", access: "full" })).toMatchObject({ status: 403, body: { error: "Only store admins can create keys" } });
    await signInAs(F.admin.admin);
    expect((await mint({ assistant: "chatgpt", access: "full" })).status).toBe(400);
    expect((await mint({ assistant: "muse", access: "storefront" })).status).toBe(400);
    expect(await prisma.tenantApiKey.count()).toBe(before);
  });

  it("mints a full key whose raw token connects with write tools; GET lists it", async () => {
    await signInAs(F.admin.admin);
    const r = await mint({ assistant: "muse", access: "full" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: "Muse", scope: "mcp:admin" });
    expect(r.body.token).toMatch(/^oss_live_/);
    expect(r.body.prefix).toBe(r.body.token.slice(0, r.body.prefix.length));
    expect(r.body.mcpUrl).toMatch(/artisansstories\.com\/api\/mcp$/);
    expect(typeof r.body.setupMessage).toBe("string");

    const row = await prisma.tenantApiKey.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(row).toMatchObject({ tenantId: HOUSE, keyHash: hashApiKey(r.body.token), scopes: ["mcp:admin"], revokedAt: null });

    const mcp = await connectMcp(r.body.token);
    expect(await mcp.toolNames()).toContain("team_add");
    expect((await mcp.call("dashboard_summary")).stats.totalOrders).toBe(11);
    await mcp.close();

    const list = await getMcp();
    expect(list.body.keys.map((k: any) => k.id)).toContain(r.body.id);
    expect(list.text).not.toContain(r.body.token);
  });

  it("mints a read-only key: no write tools", async () => {
    await signInAs(F.admin.super);
    const r = await mint({ assistant: "grokbot", access: "read" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: "Grokbot (read-only)", scope: "mcp:read" });
    const mcp = await connectMcp(r.body.token);
    const names = await mcp.toolNames();
    expect(names).toContain("dashboard_summary");
    expect(names).not.toContain("settings_update");
    await mcp.close();
  });

  it("another store's admin mints for their own store only", async () => {
    await signInAs(F.admin.oSuper);
    const r = await mint({ assistant: "muse", access: "full" }, "other-store.artisansstories.com");
    expect(r.status).toBe(201);
    expect(r.body.mcpUrl).toMatch(/other-store\.artisansstories\.com\/api\/mcp$/);
    expect((await prisma.tenantApiKey.findUniqueOrThrow({ where: { id: r.body.id } })).tenantId).toBe(OTHER);
    expect(await mcpTotalOrders(r.body.token)).toBe(1);
  });
});

describe("DELETE /api/admin/mcp/keys/[keyId]", () => {
  it("401 without a session; EDITOR 403 — key keeps working", async () => {
    expect((await revoke(F.key.houseAdmin)).status).toBe(401);
    await signInAs(F.admin.editor);
    expect(await revoke(F.key.houseAdmin)).toMatchObject({ status: 403, body: { error: "Only store admins can revoke keys" } });
    expect(await mcpTotalOrders(KEYS.houseAdmin)).toBe(11);
  });

  it("revokes a minted key: connect then fails 401, GET no longer lists it, second revoke 404", async () => {
    await signInAs(F.admin.admin);
    const minted = await mint({ assistant: "muse", access: "full" });
    expect(await mcpTotalOrders(minted.body.token)).toBe(11);

    const r = await revoke(minted.body.id);
    expect(r).toMatchObject({ status: 200, body: { id: minted.body.id, revoked: true } });
    expect((await prisma.tenantApiKey.findUniqueOrThrow({ where: { id: minted.body.id } })).revokedAt).not.toBeNull();
    expect(await connectRefusal(minted.body.token)).toEqual({ status: 401, message: expect.stringContaining("Credential is not valid") });
    expect((await getMcp()).body.keys.map((k: any) => k.id)).not.toContain(minted.body.id);
    expect((await revoke(minted.body.id)).status).toBe(404);
  });

  it("revokes a seeded key", async () => {
    await signInAs(F.admin.super);
    expect((await revoke(F.key.houseRead)).status).toBe(200);
    expect(await connectRefusal(KEYS.houseRead)).toMatchObject({ status: 401 });
  });

  it("another store's key id, the storefront key, and unknown ids are 404 and untouched", async () => {
    await signInAs(F.admin.super);
    expect(await revoke(F.key.otherAdmin)).toMatchObject({ status: 404, body: { error: "Key not found" } });
    expect(await revoke(F.key.storefront)).toMatchObject({ status: 404 });
    expect((await revoke("nope")).status).toBe(404);
    expect(await prisma.tenantApiKey.count({ where: { revokedAt: { not: null } } })).toBe(0);
    expect(await mcpTotalOrders(KEYS.otherAdmin)).toBe(1);
  });
});
