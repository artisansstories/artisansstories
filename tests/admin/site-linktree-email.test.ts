import { describe, it, expect, vi, beforeEach } from "vitest";

// Parity checks for the SITE group routes that moved into
// admin-services/{linktree,email-template}.ts: tenant comes from the admin
// session (fallback tenant zero), every statement is tenant-scoped, and the
// response bodies / 500 messages match main.

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
vi.mock("@/lib/tenant-context", () => ({
  resolveTenantFromAdminSession: tc.resolve,
  DEFAULT_TENANT_ID: "tenant_zero",
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
  tc.resolve.mockResolvedValue("tenant_a");
  auth.requireAdminSession.mockResolvedValue({ id: "a1", tenantId: "tenant_a" });
});

describe("linktree links", () => {
  it("GET scopes to the session tenant and returns {links}", async () => {
    pg.rows.push([{ id: "l1" }]);
    const res = await links.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ links: [{ id: "l1" }] });
    expect(pg.queries[0].params).toEqual(["tenant_a"]);
    expect(pg.end).toHaveBeenCalledTimes(1);
  });

  it("falls back to tenant zero when the session has no tenant (as main)", async () => {
    tc.resolve.mockResolvedValue(null);
    await links.GET();
    expect(pg.queries[0].params).toEqual(["tenant_zero"]);
  });

  it("POST stamps tenant and next sortOrder", async () => {
    pg.rows.push([{ max: 4 }], [{ id: "new" }]);
    const res = await links.POST(json("POST", { title: "T", url: "https://u" }));
    expect(await res.json()).toEqual({ link: { id: "new" } });
    const [, ins] = pg.queries;
    expect(ins.params.slice(1)).toEqual(["tenant_a", "T", "https://u", null, null, true, 5]);
  });

  it("PUT scopes by id AND tenant; missing row -> {} (link undefined), 200", async () => {
    pg.rows.push([]);
    const res = await links.PUT(json("PUT", { id: "l1", title: "X" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(pg.queries[0].params).toEqual(["l1", "X", undefined, null, undefined, "tenant_a"]);
  });

  it("DELETE scopes by id AND tenant", async () => {
    const res = await links.DELETE(new Request("http://localhost/x?id=l9", { method: "DELETE" }));
    expect(await res.json()).toEqual({ success: true });
    expect(pg.queries[0].params).toEqual(["l9", "tenant_a"]);
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
    expect(pg.queries.map((q) => q.params)).toEqual([[0, "b", "tenant_a"], [1, "a", "tenant_a"]]);
  });

  it("settings GET -> {settings:null} when missing; POST upserts on tenant", async () => {
    let res = await ltSettings.GET();
    expect(await res.json()).toEqual({ settings: null });
    pg.rows.push([{ id: "s" }]);
    res = await ltSettings.POST(json("POST", { isEnabled: true, profileName: "P", backgroundColor: "#1", buttonColor: "#2", textColor: "#3" }));
    expect(await res.json()).toEqual({ settings: { id: "s" } });
    expect(pg.queries[1].params).toEqual([true, "P", null, null, null, "#1", "#2", "#3", "tenant_a"]);
  });

  it("analytics: 401 before any DB work when unauthenticated", async () => {
    auth.requireAdminSession.mockRejectedValue(new Error("no"));
    const res = await analytics.GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(pg.connect).not.toHaveBeenCalled();
    expect(tc.resolve).not.toHaveBeenCalled();
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
    expect(pg.queries.every((q) => q.params[0] === "tenant_a")).toBe(true);
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
    expect(p[30]).toBe("tenant_a");
  });

  it("POST failure -> 500 'Failed to save template'", async () => {
    pg.connect.mockRejectedValue(new Error("down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await emailTpl.POST(json("POST", {}));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to save template" });
    err.mockRestore();
  });

  it("upload-logo: 401 first, 400 without file, then email/logo-<ts>.<ext>", async () => {
    auth.requireAdminSession.mockRejectedValueOnce(new Error("no"));
    let res = await uploadLogo.POST(new Request("http://localhost/x", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(401);

    res = await uploadLogo.POST(new Request("http://localhost/x", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No file provided" });

    const fd = new FormData();
    fd.append("file", new File([new Uint8Array([1, 2])], "logo.png", { type: "image/png" }));
    res = await uploadLogo.POST(new Request("http://localhost/x", { method: "POST", body: fd }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.filename).toBe("logo.png");
    expect(body.url).toMatch(/^https:\/\/cdn\.test\/email\/logo-\d+\.png$/);
    expect(r2.putObject).toHaveBeenCalledWith(expect.stringMatching(/^email\/logo-\d+\.png$/), expect.any(Buffer), "image/png");
  });
});
