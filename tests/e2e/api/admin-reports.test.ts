/**
 * Dashboard, reports and store settings: every route + method and every MCP
 * tool that mirrors them (dashboard_summary, reports_*, settings_*).
 *
 * Expected numbers are derived from the seed (tests/e2e/seed.ts) so the
 * assertions stay correct whatever day of the month the suite runs on.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked } from "../helpers/mcp";
import { resendState } from "../helpers/fakes";
import * as dashboardRoute from "@/app/api/admin/dashboard/route";
import * as salesRoute from "@/app/api/admin/reports/sales/route";
import * as productsRoute from "@/app/api/admin/reports/products/route";
import * as customersRoute from "@/app/api/admin/reports/customers/route";
import * as discountsRoute from "@/app/api/admin/reports/discounts/route";
import * as settingsRoute from "@/app/api/admin/settings/route";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── seed mirror: house orders (days ago, total, financialStatus) ─────────────
const HOUSE_ORDERS: Array<{ days: number; total: number; fin: string }> = [
  { days: 1, total: 5000, fin: "PENDING" },
  { days: 2, total: 15500, fin: "AUTHORIZED" },
  { days: 3, total: 12000, fin: "PAID" },
  { days: 4, total: 12000, fin: "PAID" },
  { days: 20, total: 15500, fin: "PAID" },
  { days: 30, total: 12000, fin: "PARTIALLY_REFUNDED" },
  { days: 5, total: 12000, fin: "PAID" },
  { days: 6, total: 12000, fin: "PAID" },
  { days: 15, total: 12000, fin: "PAID" },
  { days: 40, total: 12000, fin: "VOIDED" },
  { days: 50, total: 12000, fin: "REFUNDED" },
];
const DAY_MS = 24 * 60 * 60 * 1000;
const monthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};
const inThisMonth = (days: number) => Date.now() - days * DAY_MS >= monthStart().getTime();
/** Paid revenue this calendar month, as the dashboard defines it (PAID or PARTIALLY_PAID). */
const houseMonthRevenue = () =>
  HOUSE_ORDERS.filter((o) => (o.fin === "PAID" || o.fin === "PARTIALLY_PAID") && inThisMonth(o.days)).reduce((s, o) => s + o.total, 0);
/** The sales report's default window (29 days back, midnight local → now) only counts PAID. */
const salesDefaultPaid = HOUSE_ORDERS.filter((o) => o.fin === "PAID" && o.days <= 29);

async function mcpCall(key: string, tool: string, args: Record<string, unknown> = {}) {
  const mcp = await connectMcp(key);
  try {
    return await mcp.call(tool, args);
  } finally {
    await mcp.close();
  }
}

// ── dashboard ────────────────────────────────────────────────────────────────

describe("GET /api/admin/dashboard + dashboard_summary", () => {
  it("401 without a session", async () => {
    const r = await call(dashboardRoute.GET as never, "GET", "/api/admin/dashboard");
    expect(r.status).toBe(401);
  });

  it("returns the house store's numbers computed from the seed", async () => {
    await signInAs(F.admin.super);
    const r = await call(dashboardRoute.GET as never, "GET", "/api/admin/dashboard");
    expect(r.status).toBe(200);
    expect(r.body.stats).toMatchObject({
      totalOrders: 11,
      monthRevenue: houseMonthRevenue(),
      activeProducts: 2, // hammock + mug (draft basket excluded)
      lowStock: 1, // F.variant.hammockRed: 2 <= 3; draft (qty 0) is out of stock, not low
    });
    expect(typeof r.body.stats.monthLabel).toBe("string");
    // 5 most recent, newest first; never another store's order.
    expect(r.body.recentOrders.map((o: any) => o.orderNumber)).toEqual(["AS-1001", "AS-1002", "AS-1003", "AS-1004", "AS-1007"]);
    expect(r.body.recentOrders[0]).toMatchObject({ id: F.order.pending, customer: { firstName: "Ben" }, items: [{ variant: { product: { name: "Woven Hammock" } } }] });
  });

  it("EDITOR sees the same dashboard (no role gate, like the UI)", async () => {
    await signInAs(F.admin.editor);
    const r = await call(dashboardRoute.GET as never, "GET", "/api/admin/dashboard");
    expect(r.status).toBe(200);
    expect(r.body.stats.totalOrders).toBe(11);
  });

  it("other store sees only its own data", async () => {
    await signInAs(F.admin.oSuper);
    const r = await call(dashboardRoute.GET as never, "GET", "/api/admin/dashboard");
    expect(r.status).toBe(200);
    expect(r.body.stats).toMatchObject({ totalOrders: 1, monthRevenue: inThisMonth(3) ? 9000 : 0, activeProducts: 1, lowStock: 0 });
    expect(r.body.recentOrders.map((o: any) => o.orderNumber)).toEqual(["OS-2001"]);
  });

  it("dashboard_summary returns exactly what the route returns", async () => {
    await signInAs(F.admin.super);
    const route = await call(dashboardRoute.GET as never, "GET", "/api/admin/dashboard");
    const mcp = await mcpCall(KEYS.houseRead, "dashboard_summary");
    expect(mcp).toEqual(route.body);
    const other = await mcpCall(KEYS.otherAdmin, "dashboard_summary");
    expect(other.stats.totalOrders).toBe(1);
  });
});

// ── reports ──────────────────────────────────────────────────────────────────

describe("GET /api/admin/reports/sales + reports_sales", () => {
  it("401 without a session", async () => {
    expect((await call(salesRoute.GET as never, "GET", "/api/admin/reports/sales")).status).toBe(401);
  });

  it("default window: last 30 days of PAID orders, previous period empty", async () => {
    await signInAs(F.admin.super);
    const r = await call(salesRoute.GET as never, "GET", "/api/admin/reports/sales");
    expect(r.status).toBe(200);
    const revenue = salesDefaultPaid.reduce((s, o) => s + o.total, 0);
    expect(salesDefaultPaid.length).toBe(6);
    expect(r.body).toMatchObject({
      totalRevenue: revenue, // 75500
      totalOrders: 6,
      avgOrderValue: Math.round(revenue / 6),
      revenueChange: 100, // nothing PAID 30–60 days ago (partial/refunded/voided aren't PAID)
      ordersChange: 100,
    });
    expect(r.body.dailyRevenue.length).toBe(30);
    const dailySum = r.body.dailyRevenue.reduce((s: number, d: any) => s + d.revenue, 0);
    expect(dailySum).toBe(revenue);
  });

  it("explicit date range", async () => {
    await signInAs(F.admin.super);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const start = fmt(new Date(Date.now() - 10 * DAY_MS));
    const end = fmt(new Date());
    const r = await call(salesRoute.GET as never, "GET", "/api/admin/reports/sales", { query: { startDate: start, endDate: end } });
    expect(r.status).toBe(200);
    // PAID within 10 days: AS-1003, 1004, 1007, 1008
    expect(r.body.totalOrders).toBe(4);
    expect(r.body.totalRevenue).toBe(48000);
    const mcp = await mcpCall(KEYS.houseRead, "reports_sales", { startDate: start, endDate: end });
    const { range, ...rest } = mcp;
    expect(range).toMatchObject({ startDate: start, endDate: end, defaulted: { startDate: false, endDate: false } });
    expect(rest).toEqual(r.body);
  });

  it("reports_sales defaults match the route and bad ranges are refused", async () => {
    await signInAs(F.admin.super);
    const route = await call(salesRoute.GET as never, "GET", "/api/admin/reports/sales");
    const mcp = await connectMcp(KEYS.houseAdmin);
    const res = await mcp.call("reports_sales");
    const { range, ...rest } = res;
    expect(range.defaulted).toEqual({ startDate: true, endDate: true });
    expect(rest).toEqual(route.body);
    expect(await mcp.call("reports_sales", { startDate: "2026-02-01", endDate: "2026-01-01" })).toMatchObject({ blocked: true, status: 400 });
    expect(await mcp.call("reports_sales", { startDate: "2020-01-01", endDate: "2026-01-01" })).toMatchObject({ blocked: true, status: 400 });
    // Malformed dates are rejected by the tool's input schema (SDK-level isError).
    expect(await mcp.call("reports_sales", { startDate: "01/02/2026" })).toMatchObject({ isError: true, __text: expect.stringContaining("YYYY-MM-DD") });
    await mcp.close();
  });
});

describe("GET /api/admin/reports/products + reports_products", () => {
  it("401 without a session", async () => {
    expect((await call(productsRoute.GET as never, "GET", "/api/admin/reports/products")).status).toBe(401);
  });

  it("top products and low stock from the seed", async () => {
    await signInAs(F.admin.super);
    const r = await call(productsRoute.GET as never, "GET", "/api/admin/reports/products");
    expect(r.status).toBe(200);
    // All house order items (every order status, as the report has always done).
    expect(r.body.topByRevenue).toEqual([
      { productId: F.prod.hammock, productName: "Woven Hammock", revenue: 5000 + 10 * 12000, unitsSold: 11, imageUrl: "https://cdn.example.test/hammock.webp" },
      { productId: F.prod.mug, productName: "Clay Mug", revenue: 7000, unitsSold: 2 },
    ]);
    expect(r.body.topByUnits.map((p: any) => p.productId)).toEqual([F.prod.hammock, F.prod.mug]);
    const low = r.body.lowStock.map((l: any) => l.variantId).sort();
    expect(low).toEqual([F.variant.draft, F.variant.hammockRed].sort());
    expect(r.body.lowStock.find((l: any) => l.variantId === F.variant.hammockRed)).toEqual({
      variantId: F.variant.hammockRed, productName: "Woven Hammock", variantName: "Red", quantity: 2, threshold: 3, sku: "HAM-001-RED",
    });
    expect(JSON.stringify(r.body)).not.toContain("Baseball Glove");
    expect(await mcpCall(KEYS.houseRead, "reports_products")).toEqual(r.body);
  });
});

describe("GET /api/admin/reports/customers + reports_customers", () => {
  it("401 without a session", async () => {
    expect((await call(customersRoute.GET as never, "GET", "/api/admin/reports/customers")).status).toBe(401);
  });

  it("customer counts and top customers (Ana first)", async () => {
    await signInAs(F.admin.super);
    const r = await call(customersRoute.GET as never, "GET", "/api/admin/reports/customers");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      totalCustomers: 2,
      newThisMonth: (inThisMonth(2) ? 1 : 0) + (inThisMonth(60) ? 1 : 0),
      returningThisMonth: 0, // no seeded customer has lastOrderAt
    });
    expect(r.body.topByLifetimeValue[0]).toMatchObject({ customerId: F.cust.ana, email: "ana@example.test", firstName: "Ana", totalSpent: 36000, totalOrders: 3 });
    expect(r.body.topByLifetimeValue.map((c: any) => c.customerId)).toEqual([F.cust.ana, F.cust.ben]);
    expect(await mcpCall(KEYS.houseRead, "reports_customers")).toEqual(r.body);
  });
});

describe("GET /api/admin/reports/discounts + reports_discounts", () => {
  it("401 without a session", async () => {
    expect((await call(discountsRoute.GET as never, "GET", "/api/admin/reports/discounts")).status).toBe(401);
  });

  it("SAVE10 usage and revenue from PAID orders", async () => {
    await signInAs(F.admin.super);
    const r = await call(discountsRoute.GET as never, "GET", "/api/admin/reports/discounts");
    expect(r.status).toBe(200);
    expect(r.body.discounts).toEqual([
      { id: F.disc.save10, code: "SAVE10", type: "PERCENTAGE", value: 10, usageCount: 2, totalRevenue: 12000, isActive: true },
      { id: F.disc.freeship, code: "FREESHIP", type: "FREE_SHIPPING", value: 0, usageCount: 0, totalRevenue: 0, isActive: false },
    ]);
    expect(await mcpCall(KEYS.houseRead, "reports_discounts")).toEqual(r.body);
    const other = await mcpCall(KEYS.otherRead, "reports_discounts");
    expect(other.discounts.map((d: any) => d.code)).toEqual(["OTHER5"]);
  });
});

// ── settings ─────────────────────────────────────────────────────────────────

describe("/api/admin/settings + settings_get", () => {
  it("401 without a session on GET, PUT and PATCH", async () => {
    expect((await call(settingsRoute.GET as never, "GET", "/api/admin/settings")).status).toBe(401);
    expect((await call(settingsRoute.PUT as never, "PUT", "/api/admin/settings", { body: { storeName: "x" } })).status).toBe(401);
    expect((await call(settingsRoute.PATCH as never, "PATCH", "/api/admin/settings", { body: { emailFromName: "x" } })).status).toBe(401);
    const s = await prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: HOUSE } });
    expect(s.storeName).toBe("Artisans Stories");
    expect(await prisma.tenantTheme.findUnique({ where: { tenantId: HOUSE } })).toBeNull();
  });

  it("GET returns the store's settings plus email branding; settings_get matches", async () => {
    await signInAs(F.admin.super);
    const r = await call(settingsRoute.GET as never, "GET", "/api/admin/settings");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: F.settings.house, tenantId: HOUSE, storeName: "Artisans Stories", facebookPixelId: "1234567890",
      contactEmail: "hello@artisansstories.com", mcpEnabled: true,
      emailFromName: null, emailReplyTo: null, emailAccentColor: null, emailLogoUrl: null,
    });
    expect(await mcpCall(KEYS.houseRead, "settings_get")).toEqual(r.body);

    await signInAs(F.admin.oSuper);
    const o = await call(settingsRoute.GET as never, "GET", "/api/admin/settings");
    expect(o.body).toMatchObject({ tenantId: OTHER, storeName: "Other Store", emailFromName: "Other Store Team", emailAccentColor: "#123456" });
    expect(await mcpCall(KEYS.otherRead, "settings_get")).toEqual(o.body);
  });

  it("GET creates the settings row when a store has none", async () => {
    await prisma.storeSettings.delete({ where: { tenantId: OTHER } });
    await signInAs(F.admin.oSuper);
    const r = await call(settingsRoute.GET as never, "GET", "/api/admin/settings");
    expect(r.status).toBe(200);
    expect(r.body.tenantId).toBe(OTHER);
    expect(await prisma.storeSettings.count({ where: { tenantId: OTHER } })).toBe(1);
  });

  it("PUT writes whitelisted fields only (tenantId, id, mcpEnabled, branding ignored)", async () => {
    await signInAs(F.admin.super);
    const r = await call(settingsRoute.PUT as never, "PUT", "/api/admin/settings", {
      body: {
        storeName: "Renamed Store", contactEmail: "new@artisansstories.com", returnPolicyDays: 45, storeEnabled: true,
        tenantId: OTHER, id: "hijacked", mcpEnabled: false, emailFromName: "Sneaky", createdAt: "2000-01-01T00:00:00Z", notAColumn: 1,
      },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: F.settings.house, tenantId: HOUSE, storeName: "Renamed Store", contactEmail: "new@artisansstories.com", returnPolicyDays: 45, storeEnabled: true, mcpEnabled: true });

    const back = await call(settingsRoute.GET as never, "GET", "/api/admin/settings");
    expect(back.body).toMatchObject({ storeName: "Renamed Store", storeEnabled: true, mcpEnabled: true, emailFromName: null });
    expect(await mcpCall(KEYS.houseRead, "settings_get")).toMatchObject({ storeName: "Renamed Store", returnPolicyDays: 45 });
    // The other store's row was not touched or moved.
    const other = await prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: OTHER } });
    expect(other).toMatchObject({ id: F.settings.other, storeName: "Other Store", mcpEnabled: true });
    expect(await prisma.storeSettings.count()).toBe(2);
  });

  it("PUT is allowed for an EDITOR (the Settings page has no role gate)", async () => {
    await signInAs(F.admin.editor);
    const r = await call(settingsRoute.PUT as never, "PUT", "/api/admin/settings", { body: { storeName: "Editor Edit" } });
    expect(r.status).toBe(200);
    expect((await prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: HOUSE } })).storeName).toBe("Editor Edit");
  });

  it("PATCH writes all four email-branding fields to the store's own theme", async () => {
    await signInAs(F.admin.oSuper);
    const r = await call(settingsRoute.PATCH as never, "PATCH", "/api/admin/settings", {
      body: { emailFromName: "  Olga's Gloves  ", emailReplyTo: "reply@other.test", emailAccentColor: "#abcdef", emailLogoUrl: "", tenantId: HOUSE },
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ emailFromName: "Olga's Gloves", emailReplyTo: "reply@other.test", emailAccentColor: "#abcdef", emailLogoUrl: null });
    const back = await call(settingsRoute.GET as never, "GET", "/api/admin/settings");
    expect(back.body).toMatchObject({ emailFromName: "Olga's Gloves", emailReplyTo: "reply@other.test", emailAccentColor: "#abcdef" });
    // theme.logoUrl (storefront) untouched; house theme not created.
    expect((await prisma.tenantTheme.findUniqueOrThrow({ where: { tenantId: OTHER } })).logoUrl).toBe("https://cdn.example.test/other-logo.png");
    expect(await prisma.tenantTheme.findUnique({ where: { tenantId: HOUSE } })).toBeNull();

    // Documented route semantics: a field missing from the body is cleared.
    const r2 = await call(settingsRoute.PATCH as never, "PATCH", "/api/admin/settings", { body: { emailFromName: "Only Name" } });
    expect(r2.body).toEqual({ emailFromName: "Only Name", emailReplyTo: null, emailAccentColor: null, emailLogoUrl: null });
  });

  it("PATCH creates the theme row for the house store", async () => {
    await signInAs(F.admin.super);
    const r = await call(settingsRoute.PATCH as never, "PATCH", "/api/admin/settings", { body: { emailFromName: "AS Team" } });
    expect(r.status).toBe(200);
    expect((await prisma.tenantTheme.findUniqueOrThrow({ where: { tenantId: HOUSE } })).emailFromName).toBe("AS Team");
  });
});

describe("settings_update (MCP)", () => {
  it("preview changes nothing → confirm → replay blocked → settings_get shows it", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "settings_update", { storeName: "MCP Store", storeEnabled: true }, async (preview) => {
      expect(preview.preview.changes).toEqual([
        { field: "storeName", before: "Artisans Stories", after: "MCP Store" },
        { field: "storeEnabled", before: false, after: true },
      ]);
      expect(preview.preview.storeVisibility).toMatch(/^PUBLISH/);
      const s = await prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: HOUSE } });
      expect(s).toMatchObject({ storeName: "Artisans Stories", storeEnabled: false });
    });
    const result = expectConfirmed(flow);
    expect(result).toMatchObject({ tenantId: HOUSE, storeName: "MCP Store", storeEnabled: true });
    expectReplayBlocked(flow);
    expect(await mcp.call("settings_get")).toMatchObject({ storeName: "MCP Store", storeEnabled: true, mcpEnabled: true });
    expect(resendState.sent).toHaveLength(0);
    await mcp.close();
  });

  it("cannot set tenantId or mcpEnabled; with nothing else to change it is refused", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const res = await mcp.call("settings_update", { mcpEnabled: false, tenantId: OTHER, id: "x" });
    expect(res).toMatchObject({ done: false, blocked: true, status: 400 });

    const flow = await previewConfirmReplay(mcp, "settings_update", { storeName: "Still Mine", mcpEnabled: false, tenantId: OTHER });
    expect(flow.preview.preview.changes.map((c: any) => c.field)).toEqual(["storeName"]);
    expect(expectConfirmed(flow)).toMatchObject({ tenantId: HOUSE, storeName: "Still Mine", mcpEnabled: true });
    expect(await prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: OTHER } })).toMatchObject({ storeName: "Other Store", mcpEnabled: true });
    await mcp.close();
  });

  it("read-only keys don't get settings write tools", async () => {
    const mcp = await connectMcp(KEYS.houseRead);
    const names = await mcp.toolNames();
    expect(names).toContain("settings_get");
    for (const t of ["settings_update", "settings_update_email_branding", "team_add", "team_update", "team_remove"]) expect(names).not.toContain(t);
    await mcp.close();
    const admin = await connectMcp(KEYS.houseAdmin);
    const all = await admin.toolNames();
    for (const t of ["dashboard_summary", "reports_sales", "reports_products", "reports_customers", "reports_discounts", "settings_get", "settings_update", "settings_update_email_branding", "team_list", "team_add", "team_update", "team_remove"]) {
      expect(all).toContain(t);
    }
    await admin.close();
  });
});

describe("settings_update_email_branding (MCP)", () => {
  it("partial update keeps omitted fields (unlike the route's PATCH)", async () => {
    const mcp = await connectMcp(KEYS.otherAdmin);
    const flow = await previewConfirmReplay(mcp, "settings_update_email_branding", { emailReplyTo: "help@other.test" }, async (preview) => {
      expect(preview.preview.changes).toEqual([{ field: "emailReplyTo", before: null, after: "help@other.test" }]);
      expect((await prisma.tenantTheme.findUniqueOrThrow({ where: { tenantId: OTHER } })).emailReplyTo).toBeNull();
    });
    expect(expectConfirmed(flow)).toEqual({ emailFromName: "Other Store Team", emailReplyTo: "help@other.test", emailAccentColor: "#123456", emailLogoUrl: null });
    expectReplayBlocked(flow);
    expect(await mcp.call("settings_get")).toMatchObject({ emailFromName: "Other Store Team", emailReplyTo: "help@other.test", emailAccentColor: "#123456" });
    expect(await prisma.tenantTheme.findUnique({ where: { tenantId: HOUSE } })).toBeNull();
    await mcp.close();
  });

  it("empty string clears a field; no-op is refused", async () => {
    const mcp = await connectMcp(KEYS.otherAdmin);
    const flow = await previewConfirmReplay(mcp, "settings_update_email_branding", { emailAccentColor: "" });
    expect(expectConfirmed(flow)).toMatchObject({ emailFromName: "Other Store Team", emailAccentColor: null });
    const noop = await mcp.call("settings_update_email_branding", { emailFromName: "Other Store Team" });
    expect(noop).toMatchObject({ done: false, blocked: true, status: 400 });
    await mcp.close();
  });
});
