/**
 * Instagram admin routes: /api/admin/instagram/connect (GET), /callback (GET),
 * /disconnect (POST). Instagram itself can't be reached locally: the fetch guard
 * refuses api.instagram.com unless a test opts in to its fake token endpoints
 * (fetchState.instagram), which is how the full connect → callback success path
 * runs here. The OAuth state is bound to a nonce cookie set by /connect.
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { F } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { fetchState } from "../helpers/fakes";
import * as connect from "@/app/api/admin/instagram/connect/route";
import * as callback from "@/app/api/admin/instagram/callback/route";
import * as disconnect from "@/app/api/admin/instagram/disconnect/route";
import { IG_STATE_COOKIE, encodeIgState, decodeIgState } from "@/lib/instagram-oauth";

const SECRET = "IGSECRET_TOKEN_SHOULD_NEVER_LEAK";
const NONCE = "0123456789abcdef0123456789abcdef";
const state = (artisanId: string, nonce = NONCE) => encodeIgState({ artisanId, nonce });
/** The browser that ran /connect holds this cookie; an attacker's victim does not. */
const WITH_NONCE = { cookie: `${IG_STATE_COOKIE}=${NONCE}` };

const connectRoute = (query?: Record<string, string>) => call(connect.GET as never, "GET", "/api/admin/instagram/connect", { query });
const callbackRoute = (query?: Record<string, string>, headers: Record<string, string> = WITH_NONCE) =>
  call(callback.GET as never, "GET", "/api/admin/instagram/callback", { query, headers });
const disconnectRoute = (body: unknown) => call(disconnect.POST as never, "POST", "/api/admin/instagram/disconnect", { body });

async function igFields(id: string) {
  const a = await prisma.artisan.findUniqueOrThrow({ where: { id }, select: { igAccessToken: true, igUserId: true, igTokenExpiry: true } });
  return { token: a.igAccessToken, userId: a.igUserId, hasExpiry: a.igTokenExpiry !== null };
}
const MARIA_CONNECTED = { token: SECRET, userId: "17841400000", hasExpiry: true };
const NOT_CONNECTED = { token: null, userId: null, hasExpiry: false };

afterEach(() => {
  delete process.env.INSTAGRAM_APP_ID;
});

describe("GET /api/admin/instagram/connect", () => {
  it("no session → 401; other store → 403", async () => {
    expect((await connectRoute({ artisanId: F.artisan.jose })).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await connectRoute({ artisanId: F.artisan.other })).status).toBe(403);
  });

  it("missing artisanId → 400", async () => {
    await signInAs(F.admin.super);
    const r = await connectRoute();
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("artisanId required");
  });

  it("INSTAGRAM_APP_ID unset (the harness) → 500 not configured", async () => {
    await signInAs(F.admin.super);
    const r = await connectRoute({ artisanId: F.artisan.jose });
    expect(r.status).toBe(500);
    expect(r.body.error).toContain("not configured");
  });

  it("with an app id → redirect to Instagram authorize carrying the artisan in state", async () => {
    process.env.INSTAGRAM_APP_ID = "e2e-ig-app";
    await signInAs(F.admin.super);
    const r = await connectRoute({ artisanId: F.artisan.jose });
    expect(r.status).toBe(307);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://api.instagram.com/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe("e2e-ig-app");
    expect(loc.searchParams.get("redirect_uri")).toBe("https://artisansstories.com/api/admin/instagram/callback");
    expect(loc.searchParams.get("response_type")).toBe("code");
    const st = decodeIgState(loc.searchParams.get("state")!);
    expect(st?.artisanId).toBe(F.artisan.jose);
    // The same nonce is set as an httpOnly cookie scoped to the Instagram routes.
    const setCookie = r.headers.get("set-cookie")!;
    expect(setCookie).toContain(`${IG_STATE_COOKIE}=${st!.nonce}`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie).toContain("Path=/api/admin/instagram");
    expect(fetchState.blocked).toEqual([]); // a redirect, not a server-side call
  });
});

describe("GET /api/admin/instagram/callback", () => {
  it("full connect → callback: tokens stored for that artisan, nonce single-use", async () => {
    process.env.INSTAGRAM_APP_ID = "e2e-ig-app";
    fetchState.instagram = true;
    await signInAs(F.admin.super);
    const start = await connectRoute({ artisanId: F.artisan.jose });
    const st = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const nonce = decodeIgState(st)!.nonce;
    const cookie = { cookie: `${IG_STATE_COOKIE}=${nonce}` };
    const r = await callbackRoute({ code: "ig-code", state: st }, cookie);
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe(`https://artisansstories.com/admin/artisans/${F.artisan.jose}/edit?ig_connected=1`);
    expect(r.headers.get("set-cookie")).toMatch(new RegExp(`${IG_STATE_COOKIE}=;.*Max-Age=0`, "i"));
    const jose = await prisma.artisan.findUniqueOrThrow({ where: { id: F.artisan.jose } });
    expect(jose.igAccessToken).toBe("IG_LONG_TOKEN_E2E");
    expect(jose.igUserId).toBe("17841400999");
    expect(jose.igTokenExpiry!.getTime()).toBeGreaterThan(Date.now() + 59 * 24 * 3600 * 1000);
    expect(await igFields(F.artisan.maria)).toEqual(MARIA_CONNECTED);
    expect(fetchState.blocked).toEqual([]);
  });

  it("OAuth CSRF: a callback URL without this browser's nonce cookie (or a different nonce) changes nothing", async () => {
    fetchState.instagram = true;
    await signInAs(F.admin.super);
    const noCookie = await callbackRoute({ code: "attacker-code", state: state(F.artisan.jose) }, {});
    expect(noCookie.headers.get("location")).toBe("https://artisansstories.com/admin/artisans?ig_error=invalid_state");
    const otherNonce = await callbackRoute({ code: "attacker-code", state: state(F.artisan.jose, "f".repeat(32)) });
    expect(otherNonce.headers.get("location")).toBe("https://artisansstories.com/admin/artisans?ig_error=invalid_state");
    // The old state format (artisanId only) is refused too.
    const legacy = await callbackRoute({ code: "attacker-code", state: Buffer.from(JSON.stringify({ artisanId: F.artisan.jose })).toString("base64") });
    expect(legacy.headers.get("location")).toBe("https://artisansstories.com/admin/artisans?ig_error=invalid_state");
    expect(fetchState.served).toEqual([]);
    expect(await igFields(F.artisan.jose)).toEqual(NOT_CONNECTED);
  });

  it("error / missing code / missing state → redirect with ig_error, no DB change", async () => {
    await signInAs(F.admin.super);
    const denied = await callbackRoute({ error: "access_denied", state: state(F.artisan.jose) });
    expect(denied.status).toBe(307);
    expect(denied.headers.get("location")).toBe("https://artisansstories.com/admin/artisans?ig_error=access_denied");
    const noCode = await callbackRoute({ state: state(F.artisan.jose) });
    expect(noCode.headers.get("location")).toBe("https://artisansstories.com/admin/artisans?ig_error=missing_code");
    const noState = await callbackRoute({ code: "abc" });
    expect(noState.headers.get("location")).toBe("https://artisansstories.com/admin/artisans?ig_error=missing_code");
    const badState = await callbackRoute({ code: "abc", state: "%%%not-base64-json" });
    expect(badState.headers.get("location")).toBe("https://artisansstories.com/admin/artisans?ig_error=invalid_state");
    // Well-formed state without an artisanId would otherwise update with `where: { id: undefined }`.
    const noArtisan = await callbackRoute({ code: "abc", state: Buffer.from(JSON.stringify({ nonce: NONCE })).toString("base64url") });
    expect(noArtisan.headers.get("location")).toBe("https://artisansstories.com/admin/artisans?ig_error=invalid_state");
    expect(fetchState.blocked).toEqual([]);
    expect(await igFields(F.artisan.jose)).toEqual(NOT_CONNECTED);
  });

  it("the error value is URL-encoded into the redirect (no parameter injection)", async () => {
    await signInAs(F.admin.super);
    const r = await callbackRoute({ error: "x&ig_connected=1" });
    const loc = new URL(r.headers.get("location")!);
    expect(loc.searchParams.get("ig_error")).toBe("x&ig_connected=1");
    expect(loc.searchParams.has("ig_connected")).toBe(false);
  });

  it("valid code+state but no session → 401, no outbound call", async () => {
    const r = await callbackRoute({ code: "abc", state: state(F.artisan.jose) });
    expect(r.status).toBe(401);
    expect(fetchState.blocked).toEqual([]);
  });

  it("other store → 403, no outbound call", async () => {
    await signInAs(F.admin.oSuper);
    const r = await callbackRoute({ code: "abc", state: state(F.artisan.other) });
    expect(r.status).toBe(403);
    expect(fetchState.blocked).toEqual([]);
    expect(await igFields(F.artisan.other)).toEqual(NOT_CONNECTED);
  });

  it("token exchange fails (fetch guard) → redirect ig_error=token_failed, no DB change", async () => {
    await signInAs(F.admin.super);
    const r = await callbackRoute({ code: "abc", state: state(F.artisan.jose) });
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("https://artisansstories.com/admin/artisans?ig_error=token_failed");
    expect(fetchState.blocked).toEqual(["https://api.instagram.com/oauth/access_token"]);
    expect(await igFields(F.artisan.jose)).toEqual(NOT_CONNECTED);
    expect(await igFields(F.artisan.maria)).toEqual(MARIA_CONNECTED);
  });
});

describe("POST /api/admin/instagram/disconnect", () => {
  it("no session → 401; other store → 403; nothing cleared", async () => {
    expect((await disconnectRoute({ artisanId: F.artisan.maria })).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await disconnectRoute({ artisanId: F.artisan.maria })).status).toBe(403);
    expect(await igFields(F.artisan.maria)).toEqual(MARIA_CONNECTED);
  });

  it("clears the Instagram fields of that artisan only", async () => {
    await prisma.artisan.update({ where: { id: F.artisan.jose }, data: { igAccessToken: "JOSE_TOKEN", igUserId: "1", igTokenExpiry: new Date() } });
    await signInAs(F.admin.super);
    const r = await disconnectRoute({ artisanId: F.artisan.maria });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(await igFields(F.artisan.maria)).toEqual(NOT_CONNECTED);
    expect(await igFields(F.artisan.jose)).toEqual({ token: "JOSE_TOKEN", userId: "1", hasExpiry: true });
  });

  it("unknown artisan / other store's artisan → 404", async () => {
    await prisma.artisan.update({ where: { id: F.artisan.other }, data: { igAccessToken: "OTHER_TOKEN" } });
    await signInAs(F.admin.super);
    expect((await disconnectRoute({ artisanId: "nope" })).status).toBe(404);
    expect((await disconnectRoute({ artisanId: F.artisan.other })).status).toBe(404);
    expect((await prisma.artisan.findUniqueOrThrow({ where: { id: F.artisan.other } })).igAccessToken).toBe("OTHER_TOKEN");
  });

  it("missing artisanId → 400 and does NOT disconnect every artisan", async () => {
    await prisma.artisan.update({ where: { id: F.artisan.jose }, data: { igAccessToken: "JOSE_TOKEN" } });
    await signInAs(F.admin.super);
    expect((await disconnectRoute({})).status).toBe(400);
    expect((await disconnectRoute({ artisanId: 123 })).status).toBe(400);
    expect(await igFields(F.artisan.maria)).toEqual(MARIA_CONNECTED);
    expect((await prisma.artisan.findUniqueOrThrow({ where: { id: F.artisan.jose } })).igAccessToken).toBe("JOSE_TOKEN");
  });
});

// ── status route behind the admin Connect panel (5b) ────────────────────────

describe("GET /api/admin/instagram/status (artisan edit page)", () => {
  it("house admin: per-artisan status with the connect URL for unconnected artisans, never a token", async () => {
    const statusRoute = await import("@/app/api/admin/instagram/status/route");
    await signInAs(F.admin.editor);
    const r = await call(statusRoute.GET as never, "GET", "/api/admin/instagram/status");
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(SECRET);
    const byId = Object.fromEntries(r.body.artisans.map((a: { id: string }) => [a.id, a]));
    expect(byId[F.artisan.maria]).toMatchObject({ connected: true, igUserId: "17841400000" });
    expect(byId[F.artisan.jose]).toMatchObject({ connected: false, connectAdminUrl: `https://artisansstories.com/admin/artisans/${F.artisan.jose}/edit#instagram` });
    // Disconnect from the panel, then the status flips.
    expect((await disconnectRoute({ artisanId: F.artisan.maria })).status).toBe(200);
    const after = await call(statusRoute.GET as never, "GET", "/api/admin/instagram/status");
    expect(after.body.artisans.find((a: { id: string }) => a.id === F.artisan.maria)).toMatchObject({ connected: false, hasToken: false });
  });

  it("another store's admin is refused (house-only, like the nav and MCP); no session is 401", async () => {
    const statusRoute = await import("@/app/api/admin/instagram/status/route");
    await signInAs(F.admin.oSuper);
    expect((await call(statusRoute.GET as never, "GET", "/api/admin/instagram/status")).status).toBe(403);
    const { signOut } = await import("../helpers/session");
    signOut();
    expect((await call(statusRoute.GET as never, "GET", "/api/admin/instagram/status")).status).toBe(401);
  });
});
