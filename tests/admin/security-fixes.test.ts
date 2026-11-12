import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Section-3 security fixes in the shared services:
//   1. PUT /api/admin/settings (and settings_update) only writes whitelisted
//      StoreSettings fields: never tenantId, id, or mcpEnabled.
//   2. Only the house tenant can write the global landing page.

const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
const tc = vi.hoisted(() => ({ resolve: vi.fn() }));
const pg = vi.hoisted(() => ({ query: vi.fn() }));
const r2 = vi.hoisted(() => ({ putObject: vi.fn() }));
const auth = vi.hoisted(() => ({ requireAdminSession: vi.fn() }));

vi.mock("@/lib/tenant-context", () => ({
  DEFAULT_TENANT_ID: "tenant_artisans_stories",
  getTenantPrismaForAdmin: async () => ({
    $tenantId: "tenant_b",
    storeSettings: { findFirst: db.findFirst, update: db.update, create: db.create },
  }),
  resolveTenantFromAdminSession: tc.resolve,
}));
vi.mock("pg", () => ({
  Client: class {
    async connect() {}
    async end() {}
    query = pg.query;
  },
}));
vi.mock("@/lib/r2", () => ({ putObject: r2.putObject, publicUrl: (k: string) => `https://cdn.test/${k}` }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: auth.requireAdminSession }));

import * as settingsRoute from "@/app/api/admin/settings/route";
import * as landingRoute from "@/app/api/admin/landing-page/settings/route";
import * as landingUpload from "@/app/api/admin/landing-page/upload/route";
import { previewUpdateSettings, WRITABLE_SETTINGS_FIELDS } from "@/lib/admin-services/settings";

const put = (body: unknown) =>
  new NextRequest("https://b.artisansstories.com/api/admin/settings", { method: "PUT", body: JSON.stringify(body) });

describe("settings mass-assignment", () => {
  beforeEach(() => {
    db.findFirst.mockReset().mockResolvedValue({ id: "ss_b", tenantId: "tenant_b", storeName: "B", mcpEnabled: false });
    db.update.mockReset().mockImplementation(async ({ data }) => ({ id: "ss_b", tenantId: "tenant_b", ...data }));
    db.create.mockReset();
  });

  it("drops tenantId, id, mcpEnabled, timestamps, email branding and unknown keys", async () => {
    const res = await settingsRoute.PUT(
      put({
        storeName: "New name",
        contactPhone: null,
        storeEnabled: true,
        tenantId: "tenant_artisans_stories",
        id: "ss_house",
        mcpEnabled: true,
        createdAt: "2020-01-01",
        updatedAt: "2020-01-01",
        emailFromName: "x",
        notAColumn: 1,
      }),
    );
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(1);
    const { where, data } = db.update.mock.calls[0][0];
    expect(where).toEqual({ id: "ss_b" });
    expect(data).toEqual({ storeName: "New name", contactPhone: null, storeEnabled: true });
  });

  it("the whitelist never contains platform-managed columns", () => {
    for (const f of ["tenantId", "id", "mcpEnabled", "createdAt", "updatedAt"]) {
      expect(WRITABLE_SETTINGS_FIELDS as readonly string[]).not.toContain(f);
    }
  });

  it("the MCP preview ignores non-whitelisted fields too", async () => {
    const r = await previewUpdateSettings(
      { $tenantId: "tenant_b", storeSettings: { findFirst: db.findFirst } } as never,
      { mcpEnabled: true, tenantId: "x" },
    );
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

describe("landing page is house-only", () => {
  beforeEach(() => {
    pg.query.mockReset().mockResolvedValue({ rows: [{ id: "singleton", heroTitle: "Hi" }] });
    r2.putObject.mockReset();
    tc.resolve.mockReset();
    auth.requireAdminSession.mockReset().mockResolvedValue({ id: "u", tenantId: "whatever" });
  });

  const save = () =>
    landingRoute.POST(new Request("https://x/api/admin/landing-page/settings", { method: "POST", body: JSON.stringify({ heroTitle: "Pwned" }) }));

  it("another store's admin gets 403 and nothing is written", async () => {
    tc.resolve.mockResolvedValue("tenant_b");
    const res = await save();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/house store/i);
    expect(pg.query).not.toHaveBeenCalled();
  });

  it("no session gets 401", async () => {
    tc.resolve.mockResolvedValue(null);
    expect((await save()).status).toBe(401);
    expect(pg.query).not.toHaveBeenCalled();
  });

  it("the house store can still save", async () => {
    tc.resolve.mockResolvedValue("tenant_artisans_stories");
    const res = await save();
    expect(res.status).toBe(200);
    expect(pg.query).toHaveBeenCalledTimes(1);
  });

  it("landing image upload is house-only as well", async () => {
    tc.resolve.mockResolvedValue("tenant_b");
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([1, 2, 3])], "a.svg", { type: "image/svg+xml" }));
    fd.set("field", "heroImageUrl");
    const res = await landingUpload.POST(new Request("https://x/api/admin/landing-page/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(403);
    expect(r2.putObject).not.toHaveBeenCalled();
  });
});
