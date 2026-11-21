import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeNonceStore } from "../helpers/nonce-store";

// Storefront notice banner: the active-window rule, validation, the admin
// route's role gate, the MCP notice_* tools (preview → confirm, permission,
// tenant isolation), and the public loader's Coming Soon gate.

const nonces = vi.hoisted(() => ({ current: null as ReturnType<typeof makeNonceStore> | null }));
const pub = vi.hoisted(() => ({ storeEnabled: true as boolean, notice: null as Record<string, unknown> | null, tenantIds: [] as string[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    get mcpNonce() {
      return nonces.current!.mcpNonce;
    },
    storeSettings: {
      findFirst: async ({ where }: { where: { tenantId: string } }) => {
        pub.tenantIds.push(where.tenantId);
        return { storeEnabled: pub.storeEnabled };
      },
    },
    storeNotice: {
      findUnique: async ({ where }: { where: { tenantId: string } }) => {
        pub.tenantIds.push(where.tenantId);
        return pub.notice;
      },
    },
  },
}));
const audit = vi.fn(async () => {});
vi.mock("@/lib/mcp/audit", () => ({ auditMcpWrite: (...a: unknown[]) => audit(...(a as [])) }));

/** In-memory tenant-scoped storeNotice table, one map per tenant. */
const tables = new Map<string, Map<string, Record<string, unknown>>>();
function fakeDb(tenantId: string, role = "ADMIN") {
  if (!tables.has(tenantId)) tables.set(tenantId, new Map());
  const rows = tables.get(tenantId)!;
  let seq = 0;
  return {
    $tenantId: tenantId,
    adminUser: { findUnique: async () => ({ id: "u1", role, name: "A", isActive: true }) },
    storeNotice: {
      findFirst: async () => [...rows.values()][0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `n_${tenantId}_${++seq}`, tenantId, updatedAt: new Date() };
        rows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { ...rows.get(where.id)!, ...data, updatedAt: new Date(Date.now() + 1) };
        rows.set(where.id, row);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id);
        rows.delete(where.id);
        return row;
      },
    },
  };
}

const admin = vi.hoisted(() => ({ role: "ADMIN" }));
vi.mock("@/lib/tenant-context", async () => ({
  ...(await import("../helpers/tenant-context-mock")).tenantContextBase,
  getTenantPrismaForAdmin: async () => fakeDb("tenant_a", admin.role),
}));
vi.mock("@/lib/admin-auth", () => ({ getAdminSession: async () => ({ id: "u1", tenantId: "tenant_a" }) }));

import { noticeStatus, noticeStatusLabel, parseNoticeTime, resolveNotice, isSafeNoticeUrl, toNoticeInputValue } from "@/lib/store-notice";
import { getLiveNotice } from "@/lib/store-notice-server";
import * as route from "@/app/api/admin/store-notice/route";
import { ALL_TOOLS, READ_TOOLS } from "@/lib/mcp/tools";
import type { ToolCtx } from "@/lib/mcp/kit";

nonces.current = makeNonceStore();

const NOW = new Date("2026-11-21T12:00:00Z");
const H = 3600_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);

describe("active window", () => {
  const base = { isVisible: true, startsAt: null as Date | null, endsAt: null as Date | null };
  it("hidden beats everything", () => {
    expect(noticeStatus({ ...base, isVisible: false }, NOW)).toBe("hidden");
    expect(noticeStatus({ ...base, isVisible: false, startsAt: at(H) }, NOW)).toBe("hidden");
  });
  it("before start is scheduled; at start is live", () => {
    expect(noticeStatus({ ...base, startsAt: at(1) }, NOW)).toBe("scheduled");
    expect(noticeStatus({ ...base, startsAt: NOW }, NOW)).toBe("live");
  });
  it("at or after expiry is expired", () => {
    expect(noticeStatus({ ...base, startsAt: at(-H), endsAt: NOW }, NOW)).toBe("expired");
    expect(noticeStatus({ ...base, startsAt: at(-H), endsAt: at(1) }, NOW)).toBe("live");
  });
  it("no start and no expiry is live", () => {
    expect(noticeStatus(base, NOW)).toBe("live");
    expect(noticeStatus(null, NOW)).toBe("none");
  });
  it("labels in Pacific time", () => {
    expect(noticeStatusLabel({ ...base, startsAt: new Date("2026-11-21T17:00:00Z") }, NOW)).toBe("Scheduled — starts Nov 21, 2026, 9:00 AM PT");
    expect(noticeStatusLabel({ ...base, endsAt: at(-1), startsAt: at(-H) }, NOW)).toMatch(/^Expired Nov 21, 2026/);
    expect(noticeStatusLabel({ ...base, isVisible: false }, NOW)).toBe("Hidden");
  });
});

describe("times", () => {
  it("reads naive times as Los Angeles wall time (PST and PDT)", () => {
    expect((parseNoticeTime("2026-11-21T09:00") as Date).toISOString()).toBe("2026-11-21T17:00:00.000Z");
    expect((parseNoticeTime("2026-07-04T09:00") as Date).toISOString()).toBe("2026-07-04T16:00:00.000Z");
    expect(toNoticeInputValue("2026-07-04T16:00:00.000Z")).toBe("2026-07-04T09:00");
  });
  it("accepts ISO with offset, empty/now = immediate, rejects junk", () => {
    expect((parseNoticeTime("2026-11-21T09:00:00-08:00") as Date).toISOString()).toBe("2026-11-21T17:00:00.000Z");
    expect(parseNoticeTime("")).toBeNull();
    expect(parseNoticeTime("now")).toBeNull();
    expect(parseNoticeTime("tomorrow")).toBe("invalid");
    expect(parseNoticeTime("2026-13-01T09:00")).toBe("invalid");
  });
});

describe("validation", () => {
  it("defaults: shown, info, starts now, never expires", () => {
    const r = resolveNotice(null, { message: "  Hello  " }, NOW);
    expect(r).toEqual({ ok: true, values: { message: "Hello", linkLabel: null, linkUrl: null, style: "info", isVisible: true, startsAt: NOW, endsAt: null } });
  });
  it("requires a message ≤ 280 chars", () => {
    expect(resolveNotice(null, {}, NOW)).toMatchObject({ ok: false, error: "Message is required" });
    expect(resolveNotice(null, { message: "x".repeat(281) }, NOW)).toMatchObject({ ok: false });
    expect(resolveNotice(null, { message: "x".repeat(280) }, NOW)).toMatchObject({ ok: true });
  });
  it("link needs both parts and a safe URL", () => {
    expect(resolveNotice(null, { message: "m", linkLabel: "Go" }, NOW)).toMatchObject({ ok: false });
    expect(resolveNotice(null, { message: "m", linkLabel: "Go", linkUrl: "javascript:alert(1)" }, NOW)).toMatchObject({ ok: false });
    expect(resolveNotice(null, { message: "m", linkLabel: "Go", linkUrl: "/shop" }, NOW)).toMatchObject({ ok: true });
    expect(isSafeNoticeUrl("https://example.com/x")).toBe(true);
    expect(isSafeNoticeUrl("//evil.com")).toBe(false);
    expect(isSafeNoticeUrl("/\\evil.com")).toBe(false);
    expect(isSafeNoticeUrl("data:text/html,x")).toBe(false);
  });
  it("expiry must be after start", () => {
    expect(resolveNotice(null, { message: "m", startsAt: "2026-11-22T09:00", endsAt: "2026-11-22T09:00" }, NOW)).toMatchObject({
      ok: false,
      error: "Expiration must be after the start time",
    });
    expect(resolveNotice(null, { message: "m", endsAt: "2026-11-21T03:00" }, NOW)).toMatchObject({ ok: false }); // 11:00Z, before NOW
  });
  it("omitted fields keep saved values; empty string clears", () => {
    const cur = { message: "Old", linkLabel: "Go", linkUrl: "/shop", style: "urgent" as const, isVisible: true, startsAt: at(-H), endsAt: at(H) };
    const r = resolveNotice(cur, { message: "New", endsAt: "", linkLabel: "", linkUrl: "" }, NOW);
    expect(r).toEqual({ ok: true, values: { ...cur, message: "New", linkLabel: null, linkUrl: null, endsAt: null } });
  });
});

describe("public loader", () => {
  beforeEach(() => {
    pub.storeEnabled = true;
    pub.tenantIds = [];
    pub.notice = { id: "n1", message: "Hi", linkLabel: null, linkUrl: null, style: "info", isVisible: true, startsAt: at(-H), endsAt: null, updatedAt: NOW };
  });
  it("returns a live notice for the requested tenant only", async () => {
    expect(await getLiveNotice("tenant_a", NOW)).toMatchObject({ message: "Hi", dismissKey: `n1:${NOW.getTime()}` });
    expect(new Set(pub.tenantIds)).toEqual(new Set(["tenant_a"]));
  });
  it("never on the Coming Soon store", async () => {
    pub.storeEnabled = false;
    expect(await getLiveNotice("tenant_a", NOW)).toBeNull();
  });
  it("not when hidden, scheduled or expired", async () => {
    pub.notice!.isVisible = false;
    expect(await getLiveNotice("tenant_a", NOW)).toBeNull();
    pub.notice!.isVisible = true;
    pub.notice!.startsAt = at(H);
    expect(await getLiveNotice("tenant_a", NOW)).toBeNull();
    pub.notice!.startsAt = at(-H);
    pub.notice!.endsAt = at(-1);
    expect(await getLiveNotice("tenant_a", NOW)).toBeNull();
  });
});

describe("admin route", () => {
  const req = (method: string, body?: unknown) =>
    new NextRequest("https://artisansstories.com/api/admin/store-notice", { method, body: body ? JSON.stringify(body) : undefined });

  beforeEach(() => {
    tables.clear();
    admin.role = "ADMIN";
  });

  it("ADMIN can create, hide and delete", async () => {
    let res = await route.PUT(req("PUT", { message: "Holiday hours", style: "warning", startsAt: "", endsAt: "" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "live", notice: { message: "Holiday hours", style: "warning" } });
    res = await route.PATCH(req("PATCH", { isVisible: false }));
    expect(await res.json()).toMatchObject({ status: "hidden" });
    res = await route.DELETE(req("DELETE"));
    expect(res.status).toBe(200);
    expect(await (await route.GET(req("GET"))).json()).toMatchObject({ status: "none", notice: null });
  });

  it("EDITOR can read but not change it", async () => {
    admin.role = "EDITOR";
    expect((await route.GET(req("GET"))).status).toBe(200);
    expect((await route.PUT(req("PUT", { message: "x" }))).status).toBe(403);
    expect(tables.get("tenant_a")!.size).toBe(0);
  });

  it("rejects invalid input with 400", async () => {
    expect((await route.PUT(req("PUT", { message: "x", style: "neon" }))).status).toBe(400);
    expect((await route.PUT(req("PUT", { message: "x", linkLabel: "Go", linkUrl: "javascript:x" }))).status).toBe(400);
  });
});

describe("MCP notice tools", () => {
  const parse = (r: { content: Array<{ type: string; text?: string }> }) => JSON.parse(r.content[0].text as string);
  const tool = (name: string) => ALL_TOOLS.find((t) => t.name === name)!;
  const ctxFor = (tenantId: string, role = "ADMIN") =>
    ({ tenantId, role, db: fakeDb(tenantId, role), principal: { kind: "key" }, actorId: "k1", actorLabel: "key" }) as unknown as ToolCtx;

  beforeEach(() => {
    tables.clear();
    nonces.current!.reset();
    audit.mockClear();
  });

  it("are registered with the right kinds; notice_get is in the read-only registry", () => {
    expect(tool("notice_get").kind).toBe("read");
    for (const n of ["notice_set", "notice_set_visibility", "notice_clear"]) {
      expect(tool(n).kind).toBe("sensitive");
      expect(tool(n).houseOnly).toBe(false);
    }
    expect(READ_TOOLS.map((t) => t.name)).toContain("notice_get");
    expect(READ_TOOLS.map((t) => t.name)).not.toContain("notice_set");
  });

  it("notice_set previews, writes nothing, then confirms once and audits", async () => {
    const ctx = ctxFor("tenant_a");
    const args = { message: "Ships Monday", linkLabel: "Details", linkUrl: "/shipping-policy" };
    const pv = parse(await tool("notice_set").handler(ctx, args));
    expect(pv).toMatchObject({ status: "pending_confirmation", preview: { action: "create_store_notice", after: { status: "live" } } });
    expect(tables.get("tenant_a")!.size).toBe(0);

    const done = parse(await tool("notice_set").handler(ctx, { ...args, confirmToken: pv.confirmToken }));
    expect(done).toMatchObject({ done: true, result: { status: "live", notice: { message: "Ships Monday" } } });
    expect(audit).toHaveBeenCalledWith(ctx, "notice_set", args, "confirmed", undefined);

    const replay = parse(await tool("notice_set").handler(ctx, { ...args, confirmToken: pv.confirmToken }));
    expect(replay).toMatchObject({ done: false, blocked: true });

    expect(parse(await tool("notice_get").handler(ctx, {}))).toMatchObject({ status: "live", notice: { linkUrl: "/shipping-policy" } });
  });

  it("notice_set_visibility and notice_clear go through preview → confirm", async () => {
    const ctx = ctxFor("tenant_a");
    const none = parse(await tool("notice_set_visibility").handler(ctx, { isVisible: false }));
    expect(none).toMatchObject({ done: false, blocked: true });

    const pv = parse(await tool("notice_set").handler(ctx, { message: "m" }));
    await tool("notice_set").handler(ctx, { message: "m", confirmToken: pv.confirmToken });

    const hv = parse(await tool("notice_set_visibility").handler(ctx, { isVisible: false }));
    expect(hv.preview).toMatchObject({ action: "hide_store_notice", after: "Hidden" });
    expect(parse(await tool("notice_set_visibility").handler(ctx, { isVisible: false, confirmToken: hv.confirmToken }))).toMatchObject({
      done: true,
      result: { status: "hidden" },
    });

    const cv = parse(await tool("notice_clear").handler(ctx, {}));
    expect(cv.preview).toMatchObject({ action: "delete_store_notice" });
    expect(tables.get("tenant_a")!.size).toBe(1);
    expect(parse(await tool("notice_clear").handler(ctx, { confirmToken: cv.confirmToken }))).toMatchObject({ done: true });
    expect(tables.get("tenant_a")!.size).toBe(0);
  });

  it("refuses EDITOR credentials at preview time (403, nothing written)", async () => {
    const out = parse(await tool("notice_set").handler(ctxFor("tenant_a", "EDITOR"), { message: "m" }));
    expect(out).toMatchObject({ done: false, blocked: true });
    expect(JSON.stringify(out)).toMatch(/ADMIN or SUPER_ADMIN/);
    expect(tables.get("tenant_a")?.size ?? 0).toBe(0);
  });

  it("is tenant-isolated: a smuggled tenantId is ignored and tokens do not cross stores", async () => {
    const a = ctxFor("tenant_a");
    const b = ctxFor("tenant_b");
    const pv = parse(await tool("notice_set").handler(a, { message: "A only", tenantId: "tenant_b" } as Record<string, unknown>));
    parse(await tool("notice_set").handler(a, { message: "A only", tenantId: "tenant_b", confirmToken: pv.confirmToken } as Record<string, unknown>));
    expect(tables.get("tenant_a")!.size).toBe(1);
    expect(tables.get("tenant_b")?.size ?? 0).toBe(0);
    expect(parse(await tool("notice_get").handler(b, {}))).toMatchObject({ status: "none" });

    const pvA = parse(await tool("notice_set").handler(a, { message: "x" }));
    const cross = parse(await tool("notice_set").handler(b, { message: "x", confirmToken: pvA.confirmToken }));
    expect(cross).toMatchObject({ done: false, blocked: true });
    expect(tables.get("tenant_b")!.size).toBe(0);
  });

  it("invalid input is a 400 result, not a write", async () => {
    const out = parse(await tool("notice_set").handler(ctxFor("tenant_a"), { message: "m", endsAt: "next week" }));
    expect(out).toMatchObject({ done: false, blocked: true });
    expect(tables.get("tenant_a")!.size).toBe(0);
  });
});
