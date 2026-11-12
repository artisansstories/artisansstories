/**
 * Cross-cutting: unauthenticated access sweep over EVERY admin API route.
 *
 * Route modules are discovered on disk at test time (src/app/api/admin/**\/route.ts),
 * so a new route is covered automatically. Each exported HTTP handler is called
 * with no / bad / orphaned session cookies and must answer 401 — never 2xx, 3xx
 * (except the documented OAuth landing below), 403-as-a-substitute, or 500 —
 * with no external side effect and no database change.
 *
 * Dynamic segments get REAL house ids, so a missing auth check would hit a real
 * row rather than a harmless 404.
 *
 * Documented exception: GET /api/admin/instagram/callback is the browser landing
 * page of Instagram's OAuth redirect. Without `code`/`state`, or with a state whose
 * nonce doesn't match the browser's state cookie, it redirects to
 * /admin/artisans?ig_error=… before touching anything (no session needed to show
 * an error; nothing is read or written). With a valid code+state+nonce cookie it
 * must 401 like everything else — that's what the sweep sends.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { F, HOUSE } from "../seed";
import { NextRequest } from "next/server";
import { encodeIgState, IG_STATE_COOKIE } from "@/lib/instagram-oauth";
import { call } from "../helpers/route";
import { signInAs, setRawSessionCookie, signOut } from "../helpers/session";
import { stripeState, resendState, s3State, fetchState, carrierState, PNG_1PX } from "../helpers/fakes";

const ROOT = path.resolve(__dirname, "../../..");
const ADMIN_API = path.join(ROOT, "src/app/api/admin");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

interface RouteFile {
  file: string;
  /** URL path with dynamic segments filled in. */
  url: string;
  params: Record<string, string>;
  usesFormData: boolean;
}

/** A real house row for each dynamic segment, keyed by "<parent>/[param]". */
const PARAM_VALUES: Record<string, string> = {
  "artisans/[id]": F.artisan.maria,
  "categories/[id]": F.cat.textiles,
  "contact/[id]": F.msg.unread,
  "customers/[id]": F.cust.ana,
  "discounts/[id]": F.disc.save10,
  "email-log/[id]": F.email.confirmation,
  "inventory/[id]": F.inventory.hammockBlue,
  "articles/[slug]": "getting-started",
  "keys/[keyId]": F.key.houseAdmin,
  "orders/[id]": F.order.paid,
  "products/[id]": F.prod.hammock,
  "returns/[id]": F.ret.requested,
  "shipping/[id]": F.zone.us,
  "rates/[rateId]": F.rate.usStandard,
  "team/[id]": F.admin.editor,
};

function discoverRoutes(): RouteFile[] {
  const out: RouteFile[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts" || e.name === "route.tsx" || e.name === "route.js") {
        const segs = path.relative(path.join(ROOT, "src/app"), path.dirname(p)).split(path.sep);
        const params: Record<string, string> = {};
        const urlSegs = segs.map((s, i) => {
          const m = /^\[(\.\.\.)?(.+)\]$/.exec(s);
          if (!m) return s;
          const value = PARAM_VALUES[`${segs[i - 1]}/${s}`] ?? "unknown_dummy_id";
          params[m[2]] = value;
          return value;
        });
        const src = fs.readFileSync(p, "utf8");
        out.push({ file: path.relative(ROOT, p), url: `/${urlSegs.join("/")}`, params, usesFormData: /\.formData\(\)/.test(src) });
      }
    }
  };
  walk(ADMIN_API);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

interface Handler {
  route: RouteFile;
  method: Method;
  fn: (...a: never[]) => Promise<Response>;
}

const HANDLERS: Handler[] = [];

beforeAll(async () => {
  for (const route of discoverRoutes()) {
    const mod = (await import(/* @vite-ignore */ path.join(ROOT, route.file))) as Record<string, unknown>;
    for (const m of METHODS) {
      if (typeof mod[m] === "function") HANDLERS.push({ route, method: m, fn: mod[m] as Handler["fn"] });
    }
  }
});

const IG_NONCE = "0123456789abcdef0123456789abcdef";

/** Call a handler; the IG callback also gets its state-nonce cookie on the request itself. */
async function invoke(h: Handler) {
  if (!isInstagramCallback(h)) return call(h.fn as never, h.method, h.route.url, requestOptions(h));
  const url = new URL(h.route.url, "https://artisansstories.com");
  for (const [k, v] of Object.entries(requestOptions(h).query)) url.searchParams.set(k, v);
  const req = new NextRequest(url, { method: "GET", headers: { host: url.host, cookie: `${IG_STATE_COOKIE}=${IG_NONCE}` } });
  const res = await (h.fn as unknown as (r: NextRequest) => Promise<Response>)(req);
  return { status: res.status, headers: res.headers, text: await res.text() };
}

function isInstagramCallback(h: Handler) {
  return h.route.file.includes("instagram/callback");
}

function requestOptions(h: Handler) {
  const query: Record<string, string> = { id: F.link.shop, artisanId: F.artisan.maria };
  if (isInstagramCallback(h)) {
    // A well-formed state whose nonce matches the request's state cookie, so the
    // handler gets past its CSRF/early-redirect checks and reaches the auth check.
    query.code = "fake-oauth-code";
    query.state = encodeIgState({ artisanId: F.artisan.maria, nonce: IG_NONCE });
  }
  if (h.method === "GET") return { params: h.route.params, query };
  if (h.route.usesFormData) {
    const fd = new FormData();
    fd.set("file", new File([PNG_1PX], "x.png", { type: "image/png" }));
    fd.set("field", "heroImageUrl");
    return { params: h.route.params, query, formData: fd };
  }
  return { params: h.route.params, query, body: {} };
}

async function fingerprint(): Promise<string> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  const parts: string[] = [];
  for (const { tablename } of tables) {
    const rows = await prisma.$queryRawUnsafe<{ j: unknown }[]>(`SELECT row_to_json(t) AS j FROM "public"."${tablename}" t`);
    parts.push(`${tablename}:${rows.map((r) => JSON.stringify(r.j)).sort().join("|")}`);
  }
  return parts.join("\n");
}

function expectNoExternalCalls(label: string) {
  expect(stripeState.calls, `${label}: Stripe`).toEqual([]);
  expect(resendState.sent, `${label}: Resend`).toEqual([]);
  expect(s3State.commands, `${label}: R2`).toEqual([]);
  expect(fetchState.blocked.concat(fetchState.served), `${label}: outbound fetch`).toEqual([]);
  expect(carrierState.calls, `${label}: carriers`).toEqual([]);
}

/** Call every handler with the current cookie jar; every one must be a clean 401. */
async function sweep(label: string, install: () => Promise<void> | void) {
  const before = await fingerprint();
  const failures: string[] = [];
  for (const h of HANDLERS) {
    await install();
    let status: number;
    let text = "";
    try {
      const r = await invoke(h);
      status = r.status;
      text = `${r.text}${r.headers.get("location") ? ` location=${r.headers.get("location")}` : ""}`;
    } catch (err) {
      failures.push(`${h.method} ${h.route.url} threw: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (status !== 401) failures.push(`${h.method} ${h.route.url} → ${status} ${text.slice(0, 160)}`);
  }
  expect(failures, `${label}: handlers that did not answer 401`).toEqual([]);
  expectNoExternalCalls(label);
  expect(await fingerprint(), `${label}: database changed`).toBe(before);
}

function sessionJwt(claims: Record<string, unknown>, opts: { secret?: string; exp?: string | number } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "30d")
    .sign(new TextEncoder().encode(opts.secret ?? process.env.NEXTAUTH_SECRET!));
}

const SUPER_CLAIMS = { id: F.admin.super, email: "anna@artisansstories.com", name: "Anna Super", role: "SUPER_ADMIN", tenantId: HOUSE };

// ── tests ───────────────────────────────────────────────────────────────────

describe("admin API 401 sweep", () => {
  it("discovers every admin route module and handler", () => {
    const files = new Set(HANDLERS.map((h) => h.route.file));
    expect(files.size).toBeGreaterThanOrEqual(67);
    expect(HANDLERS.length).toBeGreaterThanOrEqual(100);
    // Every route file exports at least one HTTP handler.
    expect(discoverRoutes().map((r) => r.file).sort()).toEqual([...files].sort());
    // Every dynamic segment got a real id (keeps PARAM_VALUES in sync with new routes).
    const unmapped = discoverRoutes().filter((r) => Object.values(r.params).includes("unknown_dummy_id")).map((r) => r.file);
    expect(unmapped).toEqual([]);
  });

  it("control: a real super-admin session gets through (no 401) on the GET handlers", async () => {
    const wrong: string[] = [];
    for (const h of HANDLERS.filter((x) => x.method === "GET" && !isInstagramCallback(x) && !x.route.file.includes("instagram/connect"))) {
      await signInAs(F.admin.super);
      const r = await call(h.fn as never, "GET", h.route.url, requestOptions(h));
      if (r.status === 401 || r.status >= 500) wrong.push(`${h.route.url} → ${r.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it("no session cookie → 401 everywhere", async () => {
    await sweep("no cookie", () => signOut());
  });

  it("garbage cookie → 401", async () => {
    await sweep("garbage", () => setRawSessionCookie("garbage"));
  });

  it("empty cookie → 401", async () => {
    await sweep("empty", () => setRawSessionCookie(""));
  });

  it("JWT signed with the wrong secret → 401", async () => {
    const tok = await sessionJwt(SUPER_CLAIMS, { secret: "wrong-secret-wrong-secret-wrong-secret" });
    await sweep("wrong secret", () => setRawSessionCookie(tok));
  });

  it("JWT signed with the MCP token secret (a different app secret) → 401", async () => {
    const tok = await sessionJwt(SUPER_CLAIMS, { secret: process.env.MCP_TOKEN_SECRET! });
    await sweep("mcp secret", () => setRawSessionCookie(tok));
  });

  it("expired JWT with the right secret → 401", async () => {
    const tok = await sessionJwt(SUPER_CLAIMS, { exp: Math.floor(Date.now() / 1000) - 60 });
    await sweep("expired", () => setRawSessionCookie(tok));
  });

  it("alg=none JWT → 401", async () => {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const tok = `${enc({ alg: "none", typ: "JWT" })}.${enc({ ...SUPER_CLAIMS, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
    await sweep("alg none", () => setRawSessionCookie(tok));
  });

  it("tampered payload on a real session (tenantId swapped) → 401", async () => {
    const real = await signInAs(F.admin.oSuper);
    const [h, , s] = real.split(".");
    const payload = Buffer.from(JSON.stringify({ ...SUPER_CLAIMS, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const tok = `${h}.${payload}.${s}`;
    await sweep("tampered", () => setRawSessionCookie(tok));
  });

  it("valid JWT for a DELETED admin with no tenantId claim → 401 (never falls back to the house store)", async () => {
    await prisma.adminUser.delete({ where: { id: F.admin.editor } });
    const tok = await sessionJwt({ id: F.admin.editor, email: "editor@artisansstories.com", name: "Eddie Editor", role: "SUPER_ADMIN" });
    await sweep("orphan (deleted admin)", () => setRawSessionCookie(tok));
  });

  it("valid JWT for an id that never existed, no tenantId claim → 401", async () => {
    const tok = await sessionJwt({ id: "ghost_admin", email: "ghost@example.test", name: "Ghost", role: "SUPER_ADMIN" });
    await sweep("orphan (unknown id)", () => setRawSessionCookie(tok));
  });

  it("instagram/callback without code/state redirects to the admin error page and touches nothing (documented exception)", async () => {
    const h = HANDLERS.find((x) => isInstagramCallback(x) && x.method === "GET")!;
    expect(h).toBeDefined();
    const before = await fingerprint();
    signOut();
    const forged = { code: "x", state: encodeIgState({ artisanId: F.artisan.maria, nonce: IG_NONCE }) }; // no matching cookie
    const queries: Record<string, string>[] = [{}, { error: "access_denied" }, { code: "x" }, forged];
    for (const query of queries) {
      const r = await call(h.fn as never, "GET", h.route.url, { query });
      expect([302, 307, 308], JSON.stringify(query)).toContain(r.status);
      const loc = r.headers.get("location") ?? "";
      expect(loc).toMatch(/^https:\/\/artisansstories\.com\/admin\/artisans\?ig_error=/);
    }
    expectNoExternalCalls("ig callback");
    expect(await fingerprint()).toBe(before);
  });
});
