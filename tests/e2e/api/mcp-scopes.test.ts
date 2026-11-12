/* eslint-disable @typescript-eslint/no-explicit-any -- parsed JSON tool results / zod internals */
/**
 * Cross-cutting: MCP credential scopes, HTTP-level auth gates, and confirm-token
 * integrity.
 *
 *   - A read-only key (mcp:read) sees only [Read] tools and cannot call any write.
 *   - Non-MCP keys, revoked keys, garbage and forged OAuth tokens → 401 + WWW-Authenticate.
 *   - Store MCP flag off / tenant not ACTIVE → 403 (and the next request works again once fixed).
 *   - Confirm tokens: bound to tool + args + tenant; expired, forged, re-signed or
 *     replayed tokens never execute.
 */
import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/mcp/route";
import { READ_TOOLS, WRITE_TOOLS } from "@/lib/mcp/tools";
import { signConfirmToken } from "@/lib/mcp/confirm-token";
import { signAccessToken } from "@/lib/mcp/tokens";
import { MCP_TOKEN_ISSUER } from "@/lib/mcp/config";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { connectMcp, type Mcp } from "../helpers/mcp";
import { stripeState, resendState, s3State } from "../helpers/fakes";

type Args = Record<string, unknown>;

async function attempt(mcp: Mcp, tool: string, args: Args) {
  try {
    const r = (await mcp.raw(tool, args)) as { content?: { text?: string }[]; isError?: boolean };
    const text = (r.content ?? []).map((c) => c.text ?? "").join("\n");
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { text, json, isError: !!r.isError };
  } catch (err) {
    return { text: err instanceof Error ? err.message : String(err), json: undefined as any, isError: true };
  }
}

/** Whole-database fingerprint (minus volatile key usage timestamps). */
async function dbFingerprint(): Promise<string> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  const parts: string[] = [];
  for (const { tablename } of tables) {
    const rows = await prisma.$queryRawUnsafe<{ j: Record<string, unknown> }[]>(`SELECT row_to_json(t) AS j FROM "public"."${tablename}" t`);
    const clean = rows.map((r) => {
      const { lastUsedAt: _l, ...rest } = r.j;
      void _l;
      return JSON.stringify(rest);
    });
    parts.push(`${tablename}:${clean.sort().join("|")}`);
  }
  return parts.join("\n");
}

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } },
};

/** Raw JSON-RPC POST to /api/mcp (no SDK client), so we see the HTTP status. */
async function rawPost(auth: string | null, body: unknown = INIT) {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (auth !== null) headers.authorization = auth;
  const res = await POST(new Request("https://artisansstories.com/api/mcp", { method: "POST", headers, body: JSON.stringify(body) }));
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, text, json };
}

function expect401(r: Awaited<ReturnType<typeof rawPost>>, label: string) {
  expect(r.status, `${label}: ${r.text}`).toBe(401);
  expect(r.headers.get("www-authenticate"), label).toBe('Bearer resource_metadata="https://artisansstories.com/.well-known/oauth-protected-resource"');
  expect(r.json?.error?.code, label).toBe(-32001);
  expect(r.json?.result, label).toBeUndefined();
}

// ── read-only key ───────────────────────────────────────────────────────────

describe("read-only key (mcp:read)", () => {
  it("lists exactly the 39 read tools, each readOnlyHint and tagged [Read]", async () => {
    const mcp = await connectMcp(KEYS.houseRead);
    try {
      const { tools } = await mcp.client.listTools();
      expect(tools).toHaveLength(39);
      expect(tools.map((t) => t.name).sort()).toEqual(READ_TOOLS.map((t) => t.name).sort());
      for (const t of tools) {
        expect(t.annotations?.readOnlyHint, t.name).toBe(true);
        expect(t.annotations?.destructiveHint, t.name).toBe(false);
        expect(t.description?.startsWith("[Read]"), `${t.name}: ${t.description}`).toBe(true);
        expect(Object.keys((t.inputSchema as { properties?: object }).properties ?? {}), t.name).not.toContain("confirmToken");
      }
    } finally {
      await mcp.close();
    }
  });

  it("every write tool fails cleanly for the read key (also with a valid house confirm token), and nothing changes", async () => {
    const before = await dbFingerprint();
    const mcp = await connectMcp(KEYS.houseRead);
    try {
      expect(WRITE_TOOLS).toHaveLength(54);
      for (const t of WRITE_TOOLS) {
        const a = await attempt(mcp, t.name, {});
        expect(a.isError, `${t.name}: ${a.text}`).toBe(true);
        expect(a.text, t.name).toMatch(/not found/i);
        expect(a.json?.confirmToken, t.name).toBeUndefined();
        // A token an admin key would have been issued for the same (empty) args doesn't help.
        const b = await attempt(mcp, t.name, { confirmToken: signConfirmToken(HOUSE, t.name, {}) });
        expect(b.isError, `${t.name} +token: ${b.text}`).toBe(true);
        expect(b.json?.done, t.name).not.toBe(true);
      }
      // Realistic args for a few money/email writes too.
      const real: [string, Args][] = [
        ["orders_refund", { orderId: F.order.paid }],
        ["orders_cancel", { orderId: F.order.paidCancel, reason: "x" }],
        ["returns_refund", { returnId: F.ret.received, amount: 100, restock: true }],
        ["contact_message_reply", { messageId: F.msg.unread, replyText: "hi" }],
        ["settings_update", { storeName: "Hijacked" }],
        ["team_add", { name: "M", email: "m@example.test", role: "ADMIN" }],
      ];
      for (const [tool, args] of real) {
        const token = signConfirmToken(HOUSE, tool, args);
        const r = await attempt(mcp, tool, { ...args, confirmToken: token });
        expect(r.isError, `${tool}: ${r.text}`).toBe(true);
      }
      // The connection is still healthy.
      const ok = await attempt(mcp, "orders_get", { orderId: F.order.paid });
      expect(ok.isError).toBe(false);
      expect(ok.json?.order?.id ?? ok.json?.id).toBe(F.order.paid);
    } finally {
      await mcp.close();
    }
    expect(stripeState.calls.filter((c) => !/retrieve|list/.test(c.method))).toEqual([]);
    expect(resendState.sent).toEqual([]);
    expect(s3State.puts).toEqual([]);
    expect(await dbFingerprint()).toBe(before);
  });

  it("a read-scoped OAuth token for a SUPER_ADMIN also gets only read tools", async () => {
    const token = await signAccessToken({ sub: F.admin.super, tenantId: HOUSE, scope: "mcp:read" });
    const mcp = await connectMcp(token);
    try {
      const names = await mcp.toolNames();
      expect(names).toHaveLength(39);
      const r = await attempt(mcp, "team_remove", { adminId: F.admin.editor });
      expect(r.isError).toBe(true);
      expect(await prisma.adminUser.count({ where: { id: F.admin.editor } })).toBe(1);
    } finally {
      await mcp.close();
    }
  });
});

// ── HTTP-level credential gates ─────────────────────────────────────────────

describe("credential gates on POST /api/mcp", () => {
  it("valid admin key initializes (control)", async () => {
    const r = await rawPost(`Bearer ${KEYS.houseAdmin}`);
    expect(r.status, r.text).toBe(200);
    expect(r.json?.result?.serverInfo?.name).toBe("artisans-stories-admin");
  });

  it("storefront key (store:read, not an MCP scope) → 401", async () => {
    expect401(await rawPost(`Bearer ${KEYS.houseStorefront}`), "storefront key");
  });

  it("revoked key → 401, for both admin and read keys", async () => {
    await prisma.tenantApiKey.updateMany({ where: { id: { in: [F.key.houseAdmin, F.key.houseRead] } }, data: { revokedAt: new Date() } });
    expect401(await rawPost(`Bearer ${KEYS.houseAdmin}`), "revoked admin");
    expect401(await rawPost(`Bearer ${KEYS.houseRead}`), "revoked read");
    // A tools/call with a revoked key is refused before any tool runs.
    const call = await rawPost(`Bearer ${KEYS.houseAdmin}`, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "settings_update", arguments: { storeName: "x" } } });
    expect401(call, "revoked tools/call");
  });

  it("missing, malformed, unknown, and look-alike credentials → 401", async () => {
    expect401(await rawPost(null), "no header");
    expect401(await rawPost("Bearer "), "empty bearer");
    expect401(await rawPost(`Basic ${Buffer.from("a:b").toString("base64")}`), "basic auth");
    expect401(await rawPost("Bearer garbage"), "garbage");
    expect401(await rawPost("Bearer oss_live_DOESNOTEXIST0000000000000000000"), "unknown key");
    expect401(await rawPost(`Bearer ${KEYS.houseAdmin.slice(0, -1)}X`), "one char off");
  });

  it("forged / mis-scoped OAuth access tokens → 401", async () => {
    const wrongSecret = new TextEncoder().encode("not-the-secret-not-the-secret-not-the-secret");
    const forged = await new SignJWT({ typ: "access", tenantId: HOUSE, scope: "mcp:admin", via: "mcp" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(MCP_TOKEN_ISSUER)
      .setAudience(MCP_TOKEN_ISSUER)
      .setSubject(F.admin.super)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(wrongSecret);
    expect401(await rawPost(`Bearer ${forged}`), "wrong-secret JWT");

    // Right secret, but the admin belongs to OTHER while the claim says HOUSE.
    const crossTenant = await signAccessToken({ sub: F.admin.oSuper, tenantId: HOUSE, scope: "mcp:admin" });
    expect401(await rawPost(`Bearer ${crossTenant}`), "admin of another tenant");

    // Inactive admin, and deleted admin.
    expect401(await rawPost(`Bearer ${await signAccessToken({ sub: F.admin.inactive, tenantId: HOUSE, scope: "mcp:admin" })}`), "inactive admin");
    const ghost = await signAccessToken({ sub: F.admin.editor, tenantId: HOUSE, scope: "mcp:admin" });
    await prisma.adminUser.delete({ where: { id: F.admin.editor } });
    expect401(await rawPost(`Bearer ${ghost}`), "deleted admin");

    // Unknown scope claim.
    const { mcpSecret } = await import("@/lib/mcp/config");
    const badScope = await new SignJWT({ typ: "access", tenantId: HOUSE, scope: "mcp:god", via: "mcp" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(MCP_TOKEN_ISSUER)
      .setAudience(MCP_TOKEN_ISSUER)
      .setSubject(F.admin.super)
      .setExpirationTime("1h")
      .sign(mcpSecret());
    expect401(await rawPost(`Bearer ${badScope}`), "unknown scope");

    // A different token type (auth code) can't be used as an access token.
    const notAccess = await new SignJWT({ typ: "code", tenantId: HOUSE, scope: "mcp:admin", via: "mcp" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(MCP_TOKEN_ISSUER)
      .setAudience(MCP_TOKEN_ISSUER)
      .setSubject(F.admin.super)
      .setExpirationTime("1h")
      .sign(mcpSecret());
    expect401(await rawPost(`Bearer ${notAccess}`), "code-typed JWT");

    // alg=none.
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(
      JSON.stringify({ typ: "access", sub: F.admin.super, tenantId: HOUSE, scope: "mcp:admin", iss: MCP_TOKEN_ISSUER, aud: MCP_TOKEN_ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url")}.`;
    expect401(await rawPost(`Bearer ${none}`), "alg none");
  });

  it("store MCP flag off → 403 for that store only; back on → 200", async () => {
    await prisma.storeSettings.update({ where: { tenantId: HOUSE }, data: { mcpEnabled: false } });
    for (const key of [KEYS.houseAdmin, KEYS.houseRead]) {
      const r = await rawPost(`Bearer ${key}`);
      expect(r.status, r.text).toBe(403);
      expect(r.json?.error?.message).toMatch(/turned off/);
      expect(r.headers.get("www-authenticate")).toBeNull();
    }
    const tok = await signAccessToken({ sub: F.admin.super, tenantId: HOUSE, scope: "mcp:admin" });
    expect((await rawPost(`Bearer ${tok}`)).status).toBe(403);
    // The other store is unaffected.
    expect((await rawPost(`Bearer ${KEYS.otherAdmin}`)).status).toBe(200);
    await prisma.storeSettings.update({ where: { tenantId: HOUSE }, data: { mcpEnabled: true } });
    expect((await rawPost(`Bearer ${KEYS.houseAdmin}`)).status).toBe(200);
  });

  it("missing StoreSettings row fails closed (403)", async () => {
    await prisma.storeSettings.delete({ where: { tenantId: OTHER } });
    const r = await rawPost(`Bearer ${KEYS.otherAdmin}`);
    expect(r.status, r.text).toBe(403);
  });

  it.each(["SUSPENDED", "PENDING", "ARCHIVED"] as const)("tenant %s → 403 (keys and OAuth tokens)", async (status) => {
    await prisma.tenant.update({ where: { id: OTHER }, data: { status } });
    const r = await rawPost(`Bearer ${KEYS.otherAdmin}`);
    expect(r.status, r.text).toBe(403);
    expect(r.json?.error?.message).toMatch(/not active/);
    const tok = await signAccessToken({ sub: F.admin.oSuper, tenantId: OTHER, scope: "mcp:admin" });
    expect((await rawPost(`Bearer ${tok}`)).status).toBe(403);
    // A tools/call is refused too, and the house store is unaffected.
    const call = await rawPost(`Bearer ${KEYS.otherAdmin}`, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "orders_list", arguments: {} } });
    expect(call.status).toBe(403);
    expect(call.text.includes("OS-2001")).toBe(false);
    expect((await rawPost(`Bearer ${KEYS.houseAdmin}`)).status).toBe(200);
  });

  it("a connection opened before suspension is refused on its next call (checked per request)", async () => {
    const mcp = await connectMcp(KEYS.otherAdmin);
    try {
      expect((await attempt(mcp, "orders_list", {})).isError).toBe(false);
      await prisma.tenant.update({ where: { id: OTHER }, data: { status: "SUSPENDED" } });
      const r = await attempt(mcp, "orders_list", {});
      expect(r.isError, r.text).toBe(true);
      expect(r.text.includes("OS-2001")).toBe(false);
    } finally {
      await mcp.close().catch(() => {});
    }
  });
});

// ── confirm tokens ──────────────────────────────────────────────────────────

describe("confirm tokens", () => {
  const A = { tool: "settings_update", args: { storeName: "Renamed by A" } as Args };
  const B = { tool: "settings_update_email_branding", args: { emailFromName: "Renamed by A" } as Args };

  async function withHouse<T>(fn: (mcp: Mcp) => Promise<T>): Promise<T> {
    const mcp = await connectMcp(KEYS.houseAdmin);
    try {
      return await fn(mcp);
    } finally {
      await mcp.close();
    }
  }

  async function settingsRow() {
    return prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: HOUSE } });
  }

  it("a token from tool A's preview cannot confirm tool B", async () => {
    await withHouse(async (mcp) => {
      const before = await dbFingerprint();
      const p = await attempt(mcp, A.tool, A.args);
      expect(p.json?.status).toBe("pending_confirmation");
      const r = await attempt(mcp, B.tool, { ...B.args, confirmToken: p.json.confirmToken });
      expect(r.json, r.text).toMatchObject({ done: false, blocked: true });
      expect(r.json.reason).toMatch(/does not match/);
      // Same args shape on a different tool (team_add vs discounts_create style): also refused.
      const r2 = await attempt(mcp, "tax_update", { defaultTaxRate: 1, confirmToken: p.json.confirmToken });
      expect(r2.json).toMatchObject({ done: false, blocked: true });
      expect(await dbFingerprint()).toBe(before);
      // The token still works for what it was issued for.
      const ok = await attempt(mcp, A.tool, { ...A.args, confirmToken: p.json.confirmToken });
      expect(ok.json, ok.text).toMatchObject({ done: true, status: "confirmed" });
      expect((await settingsRow()).storeName).toBe("Renamed by A");
    });
  });

  it("a token cannot confirm different args (changed value, added field, removed field)", async () => {
    await withHouse(async (mcp) => {
      const before = await dbFingerprint();
      const p = await attempt(mcp, "orders_refund", { orderId: F.order.paid, amount: 100 });
      expect(p.json?.status, p.text).toBe("pending_confirmation");
      const t = p.json.confirmToken;
      for (const args of [
        { orderId: F.order.paid, amount: 12000 },
        { orderId: F.order.paidCancel, amount: 100 },
        { orderId: F.order.paid },
        { orderId: F.order.paid, amount: 100, reason: "extra" },
      ]) {
        const r = await attempt(mcp, "orders_refund", { ...args, confirmToken: t });
        expect(r.json, `${JSON.stringify(args)}: ${r.text}`).toMatchObject({ done: false, blocked: true });
      }
      expect(stripeState.refunds).toEqual([]);
      expect(resendState.sent).toEqual([]);
      expect(await dbFingerprint()).toBe(before);
    });
  });

  it("cosmetic differences (key order, explicit nulls) still verify — and only once", async () => {
    await withHouse(async (mcp) => {
      const p = await attempt(mcp, "orders_set_note", { orderId: F.order.paid, adminNote: "hello" });
      const ok = await attempt(mcp, "orders_set_note", { adminNote: "hello", orderId: F.order.paid, confirmToken: p.json.confirmToken });
      expect(ok.json, ok.text).toMatchObject({ done: true });
      const replay = await attempt(mcp, "orders_set_note", { orderId: F.order.paid, adminNote: "hello", confirmToken: p.json.confirmToken });
      expect(replay.json).toMatchObject({ done: false, blocked: true });
      expect(replay.json.reason).toMatch(/already used/);
    });
  });

  it("an expired token is refused with an 'expired' reason", async () => {
    await withHouse(async (mcp) => {
      const before = await dbFingerprint();
      const stale = signConfirmToken(HOUSE, A.tool, A.args, Date.now() - 11 * 60 * 1000);
      const r = await attempt(mcp, A.tool, { ...A.args, confirmToken: stale });
      expect(r.json, r.text).toMatchObject({ done: false, blocked: true });
      expect(r.json.reason).toMatch(/expired/i);
      expect(await dbFingerprint()).toBe(before);
    });
  });

  it("forged tokens are refused: garbage, random HMAC, extended expiry, wrong secret, other tenant", async () => {
    await withHouse(async (mcp) => {
      const before = await dbFingerprint();
      const p = await attempt(mcp, A.tool, A.args);
      const real: string = p.json.confirmToken;
      const [exp, sig] = real.split(".");
      const canonicalPayload = (tenant: string, expiry: number) => `${tenant}|${A.tool}|${JSON.stringify({ storeName: "Renamed by A" })}|${expiry}`;
      const far = Date.now() + 365 * 24 * 3600 * 1000;
      const forged = [
        "",
        "yes",
        "approved",
        "true",
        "1",
        "0.0",
        `${exp}.`,
        `.${sig}`,
        `${exp}.${"0".repeat(64)}`,
        `${exp}.${sig.slice(0, -1)}${sig.endsWith("a") ? "b" : "a"}`,
        `${Number(exp) + 60_000}.${sig}`, // extend the expiry on a real signature
        `${far}.${createHmac("sha256", "guessed-secret").update(canonicalPayload(HOUSE, far)).digest("hex")}`,
        signConfirmToken(OTHER, A.tool, A.args), // signed for another tenant
        `${real}${real}`,
        real.toUpperCase(),
      ];
      for (const tok of forged) {
        const r = await attempt(mcp, A.tool, { ...A.args, confirmToken: tok });
        if (tok === "") {
          // Empty string = "no token" → just a fresh preview.
          expect(r.json?.status, r.text).toBe("pending_confirmation");
          continue;
        }
        expect(r.json, `${tok}: ${r.text}`).toMatchObject({ done: false });
        expect(r.json.status, tok).not.toBe("confirmed");
      }
      expect(await dbFingerprint()).toBe(before);
    });
  });

  it("the read key never receives a confirm token from any tool it can call", async () => {
    const mcp = await connectMcp(KEYS.houseRead);
    try {
      for (const t of READ_TOOLS) {
        const r = await attempt(mcp, t.name, {});
        expect(r.text.includes("confirmToken"), t.name).toBe(false);
        expect(r.text.includes("pending_confirmation"), t.name).toBe(false);
      }
    } finally {
      await mcp.close();
    }
  });
});
