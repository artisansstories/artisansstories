import { describe, it, expect, vi, beforeEach } from "vitest";

// Parity checks for the SITE group routes that moved into
// admin-services/{linktree,email-template}.ts: tenant comes from the admin
// session (never a fallback tenant: no session -> 401), these areas are
// house-only (other stores -> 403), every statement is tenant-scoped, and the
// response bodies / 500 messages match main.

const HOUSE = "tenant_artisans_stories";

const pg = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  rows: [] as unknown[][],
  connect: vi.fn(),
  end: vi.fn(),
}));
const tc = vi.hoisted(() => ({ resolve: vi.fn() }));
const r2 = vi.hoisted(() => ({ putObject: vi.fn() }));
const auth = vi.hoisted(() => ({ requireAdminSession: vi.fn() }));

vi.mock("pg", () => ({
  Client: class {
    connect = pg.connect;
    end = pg.end;
    async query(sql: string, params: unknown[] = []) {
      pg.queries.push({ sql, params });
      return { rows: pg.rows.shift() ?? [] };
    }
  },
}));
vi.mock("@/lib/tenant-context", async () => ({
  ...(await import("../helpers/tenant-context-mock")).tenantContextBase,
  resolveTenantFromAdminSession: tc.resolve,
}));
vi.mock("@/lib/r2", () => ({ putObject: r2.putObject, publicUrl: (k: string) => `https://cdn.test/${k}` }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: auth.requireAdminSession }));

import * as links from "@/app/api/admin/linktree/links/route";
import * as reorder from "@/app/api/admin/linktree/links/reorder/route";
import * as ltSettings from "@/app/api/admin/linktree/settings/route";
import * as analytics from "@/app/api/admin/linktree/analytics/route";
import * as emailTpl from "@/app/api/admin/email-template/route";
import * as uploadLogo from "@/app/api/admin/email-template/upload-logo/route";

const json = (method: string, body: unknown, url = "http://localhost/x") =>
  new Request(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  pg.queries.length = 0;
  pg.rows.length = 0;
  pg.connect.mockResolvedValue(undefined);
  pg.end.mockResolvedValue(undefined);
  tc.resolve.mockResolvedValue(HOUSE);
  auth.requireAdminSession.mockResolvedValue({ id: "a1", tenantId: HOUSE });
});

describe("linktree links", () => {
  it("GET scopes to the session tenant and returns {links}", async () => {
    pg.rows.push([{ id: "l1" }]);
    const res = await links.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ links: [{ id: "l1" }] });
    expect(pg.queries[0].params).toEqual([HOUSE]);
    expect(pg.end).toHaveBeenCalledTimes(1);
  });

  it("no session tenant -> 401, never falls back to the house tenant, no DB work", async () => {
    tc.resolve.mockResolvedValue(null);
    const res = await links.GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(pg.connect).not.toHaveBeenCalled();
    expect(pg.queries).toHaveLength(0);
  });

  it("another store's admin gets 403 on every linktree handler, no DB work", async () => {
    tc.resolve.mockResolvedValue("tenant_b");
    const responses = [
      await links.GET(),
      await links.POST(json("POST", { title: "T", url: "https://u" })),
      await links.PUT(json("PUT", { id: "l1", title: "X" })),
      await links.DELETE(new Request("http://localhost/x?id=l9", { method: "DELETE" })),
      await reorder.POST(json("POST", { linkIds: ["a"] })),
      await ltSettings.GET(),
      await ltSettings.POST(json("POST", { isEnabled: true })),
      await analytics.GET(),
    ];
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/only available for the Artisans Stories store/);
    }
    expect(pg.connect).not.toHaveBeenCalled();
    expect(pg.queries).toHaveLength(0);
  });

  it("POST stamps tenant and next sortOrder", async () => {
    pg.rows.push([{ max: 4 }], [{ id: "new" }]);
    const res = await links.POST(json("POST", { title: "T", url: "https://u" }));
    expect(await res.json()).toEqual({ link: { id: "new" } });
    const [, ins] = pg.queries;
    expect(ins.params.slice(1)).toEqual([HOUSE, "T", "https://u", null, null, true, 5]);
  });

  it("PUT scopes by id AND tenant; missing row (unknown or other store's id) -> 404", async () => {
    pg.rows.push([]);
    const res = await links.PUT(json("PUT", { id: "l1", title: "X" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Link not found" });
    expect(pg.queries[0].params).toEqual(["l1", "X", undefined, null, undefined, HOUSE]);
  });

  it("DELETE scopes by id AND tenant; nothing deleted -> 404", async () => {
    pg.rows.push([{ id: "l9" }]);
    let res = await links.DELETE(new Request("http://localhost/x?id=l9", { method: "DELETE" }));
    expect(await res.json()).toEqual({ success: true });
    expect(pg.queries[0].params).toEqual(["l9", HOUSE]);
    res = await links.DELETE(new Request("http://localhost/x?id=nope", { method: "DELETE" }));
    expect(res.status).toBe(404);
  });

  it("DB failure -> 500 with main's message", async () => {
    pg.connect.mockRejectedValue(new Error("down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await links.GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch links" });
    err.mockRestore();
  });
});

describe("linktree reorder / settings / analytics", () => {
  it("reorder updates each id scoped to tenant", async () => {
    const res = await reorder.POST(json("POST", { linkIds: ["b", "a"] }));
    expect(await res.json()).toEqual({ success: true });
    expect(pg.queries.map((q) => q.params)).toEqual([[0, "b", HOUSE], [1, "a", HOUSE]]);
  });

  it("settings GET -> {settings:null} when missing; POST upserts on tenant", async () => {
    let res = await ltSettings.GET();
    expect(await res.json()).toEqual({ settings: null });
    pg.rows.push([{ id: "s" }]);
    res = await ltSettings.POST(json("POST", { isEnabled: true, profileName: "P", backgroundColor: "#1", buttonColor: "#2", textColor: "#3" }));
    expect(await res.json()).toEqual({ settings: { id: "s" } });
    expect(pg.queries[1].params).toEqual([true, "P", null, null, null, "#1", "#2", "#3", HOUSE, expect.any(String)]);
  });

  it("analytics: 401 before any DB work when unauthenticated", async () => {
    tc.resolve.mockResolvedValue(null);
    const res = await analytics.GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(pg.connect).not.toHaveBeenCalled();
  });

  it("analytics: shape and totalAllTime", async () => {
    pg.rows.push([{ clicks: "3" }, { clicks: "4" }], [{ id: "r" }], [{ date: "d", clicks: "7" }]);
    const res = await analytics.GET();
    expect(await res.json()).toEqual({
      linkClicks: [{ clicks: "3" }, { clicks: "4" }],
      recentLog: [{ id: "r" }],
      dailyTotals: [{ date: "d", clicks: "7" }],
      totalAllTime: 7,
    });
    expect(pg.queries.every((q) => q.params[0] === HOUSE)).toBe(true);
  });
});

describe("email template", () => {
  it("GET {template:null}; POST binds defaults and tenant as $31", async () => {
    let res = await emailTpl.GET();
    expect(await res.json()).toEqual({ template: null });
    pg.rows.push([{ id: "t" }]);
    res = await emailTpl.POST(json("POST", { greetingText: "Hi" }));
    expect(await res.json()).toEqual({ template: { id: "t" } });
    const p = pg.queries[1].params;
    expect(p).toHaveLength(31);
    expect(p[3]).toBe("Hi");
    expect(p[4]).toBe(true);
    expect(p[21]).toBe("#E4405F");
    expect(p[30]).toBe(HOUSE);
  });

  it("POST failure -> 500 'Failed to save template'", async () => {
    pg.connect.mockRejectedValue(new Error("down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await emailTpl.POST(json("POST", {}));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to save template" });
    err.mockRestore();
  });

  it("GET/POST: 401 with no session, 403 for another store, no DB work", async () => {
    tc.resolve.mockResolvedValueOnce(null).mockResolvedValueOnce("tenant_b");
    expect((await emailTpl.GET()).status).toBe(401);
    expect((await emailTpl.POST(json("POST", { greetingText: "Hi" }))).status).toBe(403);
    expect(pg.connect).not.toHaveBeenCalled();
  });

  it("upload-logo: 401 first, 403 for another store, 400 without file, then tenants/<id>/email/logo-<ts>.<ext>", async () => {
    tc.resolve.mockResolvedValueOnce(null).mockResolvedValueOnce("tenant_b");
    let res = await uploadLogo.POST(new Request("http://localhost/x", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(401);
    const fd403 = new FormData();
    fd403.append("file", new File([new Uint8Array([1, 2])], "logo.png", { type: "image/png" }));
    res = await uploadLogo.POST(new Request("http://localhost/x", { method: "POST", body: fd403 }));
    expect(res.status).toBe(403);
    expect(r2.putObject).not.toHaveBeenCalled();

    res = await uploadLogo.POST(new Request("http://localhost/x", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No file provided" });

    const fd = new FormData();
    fd.append("file", new File([new Uint8Array([1, 2])], "logo.png", { type: "image/png" }));
    res = await uploadLogo.POST(new Request("http://localhost/x", { method: "POST", body: fd }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.filename).toBe("logo.png");
    expect(body.url).toMatch(new RegExp(`^https://cdn\\.test/tenants/${HOUSE}/email/logo-\\d+\\.png$`));
    expect(r2.putObject).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^tenants/${HOUSE}/email/logo-\\d+\\.png$`)), expect.any(Buffer), "image/png");
  });
});
