/**
 * Commerce domain, part 1: customers + discounts.
 * Every route+method under /api/admin/{customers,discounts}/** and every
 * customers_* / discounts_* MCP tool, against the seeded local database.
 * Shipping: commerce-shipping.test.ts. Tax: commerce-tax.test.ts.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked } from "../helpers/mcp";
import * as customersRoute from "@/app/api/admin/customers/route";
import * as customerRoute from "@/app/api/admin/customers/[id]/route";
import * as discountsRoute from "@/app/api/admin/discounts/route";
import * as discountRoute from "@/app/api/admin/discounts/[id]/route";
import * as genCodeRoute from "@/app/api/admin/discounts/generate-code/route";

const h = (fn: unknown) => fn as never;
const CODE_RE = /^(SAVE|GET|USE|ARTISAN|CRAFT|SHOP|OFF|DEAL)\d+$/;

// ── auth: every route+method without a session ──────────────────────────────

describe("commerce routes require a session (401)", () => {
  const cases: [string, unknown, string, string, Record<string, string>?, unknown?][] = [
    ["GET /customers", customersRoute.GET, "GET", "/api/admin/customers"],
    ["GET /customers/[id]", customerRoute.GET, "GET", `/api/admin/customers/${F.cust.ana}`, { id: F.cust.ana }],
    ["PATCH /customers/[id]", customerRoute.PATCH, "PATCH", `/api/admin/customers/${F.cust.ana}`, { id: F.cust.ana }, { notes: "x" }],
    ["GET /discounts", discountsRoute.GET, "GET", "/api/admin/discounts"],
    ["POST /discounts", discountsRoute.POST, "POST", "/api/admin/discounts", undefined, { code: "NOAUTH", type: "PERCENTAGE", value: 5 }],
    ["GET /discounts/[id]", discountRoute.GET, "GET", `/api/admin/discounts/${F.disc.save10}`, { id: F.disc.save10 }],
    ["PUT /discounts/[id]", discountRoute.PUT, "PUT", `/api/admin/discounts/${F.disc.save10}`, { id: F.disc.save10 }, { value: 50 }],
    ["PATCH /discounts/[id]", discountRoute.PATCH, "PATCH", `/api/admin/discounts/${F.disc.save10}`, { id: F.disc.save10 }, { isActive: false }],
    ["DELETE /discounts/[id]", discountRoute.DELETE, "DELETE", `/api/admin/discounts/${F.disc.save10}`, { id: F.disc.save10 }],
    ["GET /discounts/generate-code", genCodeRoute.GET, "GET", "/api/admin/discounts/generate-code"],
  ];
  for (const [label, fn, method, path, params, body] of cases) {
    it(label, async () => {
      const r = await call(h(fn), method, path, { params, body });
      expect(r.status, r.text).toBe(401);
    });
  }

  it("no unauthenticated write reached the database", async () => {
    for (const [, fn, method, path, params, body] of cases) await call(h(fn), method, path, { params, body });
    expect(await prisma.discount.findUnique({ where: { id: F.disc.save10 } })).toMatchObject({ value: 10, isActive: true });
    expect(await prisma.discount.count({ where: { code: "NOAUTH" } })).toBe(0);
    expect((await prisma.customer.findUnique({ where: { id: F.cust.ana } }))!.notes).toBe("Prefers email");
  });
});

// ── customers: routes ───────────────────────────────────────────────────────

describe("customers routes", () => {
  it("GET /customers lists the house store only, with live stats, ordered by stored totalSpent", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(customersRoute.GET), "GET", "/api/admin/customers");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 2, page: 1, pages: 1 });
    expect(r.body.customers.map((c: { id: string }) => c.id)).toEqual([F.cust.ana, F.cust.ben]);
    // Ana: 7 orders, PARTIALLY_REFUNDED + REFUNDED excluded → 5 active, 67000 cents.
    expect(r.body.customers[0]).toMatchObject({ email: "ana@example.test", totalOrders: 5, totalOrdersAll: 7, totalSpent: 67000 });
    // Ben: 4 orders, CANCELLED excluded → 3 active, 29000 cents.
    expect(r.body.customers[1]).toMatchObject({ email: "ben@example.test", totalOrders: 3, totalOrdersAll: 4, totalSpent: 29000 });
  });

  it("GET /customers search + paging", async () => {
    await signInAs(F.admin.super);
    const s = await call(h(customersRoute.GET), "GET", "/api/admin/customers", { query: { search: "RUIZ" } });
    expect(s.body.customers.map((c: { id: string }) => c.id)).toEqual([F.cust.ben]);
    const p2 = await call(h(customersRoute.GET), "GET", "/api/admin/customers", { query: { page: "2", limit: "1" } });
    expect(p2.body).toMatchObject({ total: 2, page: 2, pages: 2 });
    expect(p2.body.customers.map((c: { id: string }) => c.id)).toEqual([F.cust.ben]);
    const other = await call(h(customersRoute.GET), "GET", "/api/admin/customers", { query: { search: "oscar" } });
    expect(other.body.total).toBe(0);
  });

  it("GET /customers with non-numeric page/limit falls back to defaults (no NaN)", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(customersRoute.GET), "GET", "/api/admin/customers", { query: { page: "abc", limit: "xyz" } });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ total: 2, page: 1, pages: 1 });
    expect(r.body.customers).toHaveLength(2);
  });

  it("GET /customers/[id] returns addresses, orders and live stats", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(customerRoute.GET), "GET", `/api/admin/customers/${F.cust.ana}`, { params: { id: F.cust.ana } });
    expect(r.status).toBe(200);
    expect(r.body.customer).toMatchObject({ id: F.cust.ana, email: "ana@example.test", tags: ["vip"], notes: "Prefers email" });
    expect(r.body.customer.addresses.map((a: { id: string }) => a.id)).toEqual([F.address.ana]);
    expect(r.body.customer.orders).toHaveLength(7);
    expect(r.body.liveStats).toEqual({
      totalOrdersAll: 7, totalOrdersActive: 5, totalOrdersCancelled: 2, netSpent: 67000, grossSpent: 91000, refundedAmount: 24000,
    });
  });

  it("GET /customers/[id] 404 for a missing id and for another store's customer", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.cust.other]) {
      const r = await call(h(customerRoute.GET), "GET", `/api/admin/customers/${id}`, { params: { id } });
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: "Customer not found" });
    }
  });

  it("PATCH /customers/[id] replaces notes and tags; GET reads it back", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(customerRoute.PATCH), "PATCH", `/api/admin/customers/${F.cust.ana}`, {
      params: { id: F.cust.ana }, body: { notes: "Call before shipping", tags: ["vip", "wholesale"] },
    });
    expect(r.status).toBe(200);
    expect(r.body.customer).toMatchObject({ id: F.cust.ana, notes: "Call before shipping", tags: ["vip", "wholesale"] });
    const g = await call(h(customerRoute.GET), "GET", `/api/admin/customers/${F.cust.ana}`, { params: { id: F.cust.ana } });
    expect(g.body.customer).toMatchObject({ notes: "Call before shipping", tags: ["vip", "wholesale"], email: "ana@example.test" });

    // Only tags: notes untouched.
    await call(h(customerRoute.PATCH), "PATCH", `/api/admin/customers/${F.cust.ana}`, { params: { id: F.cust.ana }, body: { tags: [] } });
    const g2 = await call(h(customerRoute.GET), "GET", `/api/admin/customers/${F.cust.ana}`, { params: { id: F.cust.ana } });
    expect(g2.body.customer).toMatchObject({ notes: "Call before shipping", tags: [] });
  });

  it("PATCH /customers/[id] 404 (not 500) for a missing id and another store's customer", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.cust.other]) {
      const r = await call(h(customerRoute.PATCH), "PATCH", `/api/admin/customers/${id}`, { params: { id }, body: { notes: "hijack" } });
      expect(r.status, r.text).toBe(404);
    }
    expect((await prisma.customer.findUnique({ where: { id: F.cust.other } }))!.notes).toBeNull();
  });

  it("other store's admin sees only its own customers", async () => {
    await signInAs(F.admin.oSuper);
    const r = await call(h(customersRoute.GET), "GET", "/api/admin/customers");
    expect(r.body.customers.map((c: { id: string }) => c.id)).toEqual([F.cust.other]);
    const g = await call(h(customerRoute.GET), "GET", `/api/admin/customers/${F.cust.ana}`, { params: { id: F.cust.ana } });
    expect(g.status).toBe(404);
  });
});

// ── customers: MCP ──────────────────────────────────────────────────────────

describe("customers MCP tools", () => {
  it("customers_list returns seeded data (same as route), search, and paging", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const l = await mcp.call("customers_list");
    expect(l).toMatchObject({ total: 2, page: 1, pages: 1 });
    expect(l.customers[0]).toMatchObject({ id: F.cust.ana, totalOrders: 5, totalSpent: 67000 });
    const s = await mcp.call("customers_list", { search: "ben" });
    expect(s.customers.map((c: { id: string }) => c.id)).toEqual([F.cust.ben]);
    const p = await mcp.call("customers_list", { page: 2, limit: 1 });
    expect(p.customers.map((c: { id: string }) => c.id)).toEqual([F.cust.ben]);
    await mcp.close();
  });

  it("customers_get by id and by email; 404 for missing / other store", async () => {
    const mcp = await connectMcp(KEYS.houseRead);
    const byId = await mcp.call("customers_get", { customerId: F.cust.ana });
    expect(byId.customer).toMatchObject({ id: F.cust.ana, tags: ["vip"] });
    expect(byId.liveStats).toMatchObject({ netSpent: 67000, totalOrdersAll: 7 });
    const byEmail = await mcp.call("customers_get", { email: "  BEN@example.test " });
    expect(byEmail.customer.id).toBe(F.cust.ben);
    expect(await mcp.call("customers_get", { customerId: F.cust.other })).toMatchObject({ blocked: true, status: 404 });
    expect(await mcp.call("customers_get", { email: "oscar@example.test" })).toMatchObject({ blocked: true, status: 404 });
    expect(await mcp.call("customers_get", {})).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("customers_update: preview (no change) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { customerId: F.cust.ben, notes: "Repeat buyer", tags: ["local"] };
    const flow = await previewConfirmReplay(mcp, "customers_update", args, async (preview) => {
      expect(preview.preview.changes).toEqual({ notes: { from: null, to: "Repeat buyer" }, tags: { from: [], to: ["local"] } });
      const row = await prisma.customer.findUnique({ where: { id: F.cust.ben } });
      expect(row).toMatchObject({ notes: null, tags: [] });
    });
    expect(expectConfirmed(flow).customer).toMatchObject({ notes: "Repeat buyer", tags: ["local"] });
    expectReplayBlocked(flow);
    const back = await mcp.call("customers_get", { customerId: F.cust.ben });
    expect(back.customer).toMatchObject({ notes: "Repeat buyer", tags: ["local"] });
    await mcp.close();
  });

  it("customers_update on a missing / other store's customer is blocked 404 and writes nothing", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(await mcp.call("customers_update", { customerId: F.cust.other, notes: "x" })).toMatchObject({ blocked: true, status: 404 });
    expect(await mcp.call("customers_update", { customerId: "nope", notes: "x" })).toMatchObject({ blocked: true, status: 404 });
    expect((await prisma.customer.findUnique({ where: { id: F.cust.other } }))!.notes).toBeNull();
    await mcp.close();
  });

  it("customers_update confirmed after the customer vanished reports 404, not 'unknown'", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    await prisma.customer.create({ data: { id: "h_cust_tmp", tenantId: HOUSE, email: "tmp@example.test" } });
    const args = { customerId: "h_cust_tmp", notes: "gone" };
    const pv = await mcp.call("customers_update", args);
    await prisma.customer.delete({ where: { id: "h_cust_tmp" } });
    const r = await mcp.call("customers_update", { ...args, confirmToken: pv.confirmToken });
    expect(r).toMatchObject({ done: false, blocked: true, status: 404 });
    await mcp.close();
  });
});

// ── discounts: routes ───────────────────────────────────────────────────────

describe("discounts routes", () => {
  it("GET /discounts lists house discounts newest first", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(discountsRoute.GET), "GET", "/api/admin/discounts");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 2, page: 1, totalPages: 1 });
    expect(r.body.discounts.map((d: { code: string }) => d.code).sort()).toEqual(["FREESHIP", "SAVE10"]);
    expect(r.body.discounts.find((d: { id: string }) => d.id === F.disc.save10)).toMatchObject({ type: "PERCENTAGE", value: 10, usageCount: 2, isActive: true });
  });

  it("GET /discounts paging and non-numeric page/limit (no NaN)", async () => {
    await signInAs(F.admin.super);
    const p = await call(h(discountsRoute.GET), "GET", "/api/admin/discounts", { query: { page: "2", limit: "1" } });
    expect(p.body).toMatchObject({ total: 2, page: 2, totalPages: 2 });
    expect(p.body.discounts).toHaveLength(1);
    const bad = await call(h(discountsRoute.GET), "GET", "/api/admin/discounts", { query: { page: "abc", limit: "" } });
    expect(bad.status, bad.text).toBe(200);
    expect(bad.body).toMatchObject({ total: 2, page: 1, totalPages: 1 });
    expect(bad.body.discounts).toHaveLength(2);
  });

  it("POST /discounts creates (trimmed, upper-cased, defaults); GET reads it back", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(discountsRoute.POST), "POST", "/api/admin/discounts", {
      body: { code: "  summer20 ", type: "PERCENTAGE", value: 20, usageLimit: 100, endsAt: "2030-01-01T00:00:00.000Z" },
    });
    expect(r.status, r.text).toBe(201);
    expect(r.body.discount).toMatchObject({
      code: "SUMMER20", type: "PERCENTAGE", value: 20, usageLimit: 100, appliesToAll: true, isActive: true, tenantId: HOUSE,
      minimumOrderAmount: null, startsAt: null, endsAt: "2030-01-01T00:00:00.000Z",
    });
    const g = await call(h(discountRoute.GET), "GET", `/api/admin/discounts/${r.body.discount.id}`, { params: { id: r.body.discount.id } });
    expect(g.body.discount).toMatchObject({ code: "SUMMER20", value: 20 });
    const l = await call(h(discountsRoute.GET), "GET", "/api/admin/discounts");
    expect(l.body.total).toBe(3);
    expect(l.body.discounts[0].code).toBe("SUMMER20");
  });

  it("POST /discounts: 400 missing fields, 409 duplicate, code unique per store only", async () => {
    await signInAs(F.admin.super);
    const missing = await call(h(discountsRoute.POST), "POST", "/api/admin/discounts", { body: { code: "X" } });
    expect(missing.status).toBe(400);
    const dup = await call(h(discountsRoute.POST), "POST", "/api/admin/discounts", { body: { code: "save10", type: "PERCENTAGE", value: 5 } });
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({ error: "Discount code already exists" });
    // OTHER5 belongs to the other store; the house can still use the code.
    const cross = await call(h(discountsRoute.POST), "POST", "/api/admin/discounts", { body: { code: "OTHER5", type: "FIXED_AMOUNT", value: 500 } });
    expect(cross.status).toBe(201);
    expect(await prisma.discount.count({ where: { code: "OTHER5" } })).toBe(2);
  });

  it("POST /discounts with an invalid date is 400, not 500", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(discountsRoute.POST), "POST", "/api/admin/discounts", { body: { code: "BADDATE", type: "PERCENTAGE", value: 5, startsAt: "not-a-date" } });
    expect(r.status, r.text).toBe(400);
    expect(await prisma.discount.count({ where: { code: "BADDATE" } })).toBe(0);
  });

  it("GET /discounts/[id] 404 for missing and other store's discount", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.disc.other]) {
      const r = await call(h(discountRoute.GET), "GET", `/api/admin/discounts/${id}`, { params: { id } });
      expect(r.status).toBe(404);
    }
  });

  it("PUT /discounts/[id] updates fields and clears with null; GET reads it back", async () => {
    await signInAs(F.admin.super);
    await prisma.discount.update({ where: { id: F.disc.save10 }, data: { usageLimit: 50 } });
    const r = await call(h(discountRoute.PUT), "PUT", `/api/admin/discounts/${F.disc.save10}`, {
      params: { id: F.disc.save10 }, body: { code: "save15", value: 15, usageLimit: null, minimumOrderAmount: 2000 },
    });
    expect(r.status, r.text).toBe(200);
    expect(r.body.discount).toMatchObject({ code: "SAVE15", value: 15, usageLimit: null, minimumOrderAmount: 2000, usageCount: 2 });
    const g = await call(h(discountRoute.GET), "GET", `/api/admin/discounts/${F.disc.save10}`, { params: { id: F.disc.save10 } });
    expect(g.body.discount).toMatchObject({ code: "SAVE15", value: 15, usageLimit: null, minimumOrderAmount: 2000 });
  });

  it("PUT /discounts/[id]: 409 duplicate code, 404 missing / other store, 400 bad date", async () => {
    await signInAs(F.admin.super);
    const dup = await call(h(discountRoute.PUT), "PUT", `/api/admin/discounts/${F.disc.save10}`, { params: { id: F.disc.save10 }, body: { code: "freeship" } });
    expect(dup.status).toBe(409);
    for (const id of ["nope", F.disc.other]) {
      const r = await call(h(discountRoute.PUT), "PUT", `/api/admin/discounts/${id}`, { params: { id }, body: { value: 99 } });
      expect(r.status).toBe(404);
    }
    expect((await prisma.discount.findUnique({ where: { id: F.disc.other } }))!.value).toBe(500);
    const bad = await call(h(discountRoute.PUT), "PUT", `/api/admin/discounts/${F.disc.save10}`, { params: { id: F.disc.save10 }, body: { endsAt: "garbage" } });
    expect(bad.status, bad.text).toBe(400);
  });

  it("PATCH /discounts/[id] toggles isActive; GET reads it back", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(discountRoute.PATCH), "PATCH", `/api/admin/discounts/${F.disc.freeship}`, { params: { id: F.disc.freeship }, body: { isActive: true } });
    expect(r.status).toBe(200);
    expect(r.body.discount).toMatchObject({ id: F.disc.freeship, isActive: true });
    const g = await call(h(discountRoute.GET), "GET", `/api/admin/discounts/${F.disc.freeship}`, { params: { id: F.disc.freeship } });
    expect(g.body.discount.isActive).toBe(true);
  });

  it("PATCH /discounts/[id] 404 (not 500) for missing and other store's discount", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.disc.other]) {
      const r = await call(h(discountRoute.PATCH), "PATCH", `/api/admin/discounts/${id}`, { params: { id }, body: { isActive: false } });
      expect(r.status, r.text).toBe(404);
    }
    expect((await prisma.discount.findUnique({ where: { id: F.disc.other } }))!.isActive).toBe(true);
  });

  it("DELETE /discounts/[id] deletes; GET then 404; past order keeps its code", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(discountRoute.DELETE), "DELETE", `/api/admin/discounts/${F.disc.save10}`, { params: { id: F.disc.save10 } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    const g = await call(h(discountRoute.GET), "GET", `/api/admin/discounts/${F.disc.save10}`, { params: { id: F.disc.save10 } });
    expect(g.status).toBe(404);
    expect((await prisma.order.findUnique({ where: { id: F.order.paid } }))!.discountCode).toBe("SAVE10");
  });

  it("DELETE /discounts/[id] 404 (not 500) for missing and other store's discount", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.disc.other]) {
      const r = await call(h(discountRoute.DELETE), "DELETE", `/api/admin/discounts/${id}`, { params: { id } });
      expect(r.status, r.text).toBe(404);
    }
    expect(await prisma.discount.findUnique({ where: { id: F.disc.other } })).not.toBeNull();
  });

  it("GET /discounts/generate-code suggests a code and creates nothing", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(genCodeRoute.GET), "GET", "/api/admin/discounts/generate-code");
    expect(r.status).toBe(200);
    expect(r.body.code).toMatch(CODE_RE);
    expect(await prisma.discount.count({ where: { tenantId: HOUSE } })).toBe(2);
  });

  it("other store's admin only sees and edits its own discounts", async () => {
    await signInAs(F.admin.oSuper);
    const l = await call(h(discountsRoute.GET), "GET", "/api/admin/discounts");
    expect(l.body.discounts.map((d: { id: string }) => d.id)).toEqual([F.disc.other]);
    const p = await call(h(discountRoute.PATCH), "PATCH", `/api/admin/discounts/${F.disc.other}`, { params: { id: F.disc.other }, body: { isActive: false } });
    expect(p.status).toBe(200);
    const c = await call(h(discountsRoute.POST), "POST", "/api/admin/discounts", { body: { code: "SAVE10", type: "PERCENTAGE", value: 5 } });
    expect(c.status).toBe(201);
    expect(c.body.discount.tenantId).toBe(OTHER);
  });
});

// ── discounts: MCP ──────────────────────────────────────────────────────────

describe("discounts MCP tools", () => {
  it("discounts_list / discounts_get (id + code) / generate_code read seeded data", async () => {
    const mcp = await connectMcp(KEYS.houseRead);
    const l = await mcp.call("discounts_list");
    expect(l).toMatchObject({ total: 2, page: 1, totalPages: 1 });
    expect(l.discounts.map((d: { code: string }) => d.code).sort()).toEqual(["FREESHIP", "SAVE10"]);
    expect((await mcp.call("discounts_list", { page: 2, limit: 1 })).discounts).toHaveLength(1);
    expect((await mcp.call("discounts_get", { discountId: F.disc.save10 })).discount).toMatchObject({ code: "SAVE10", value: 10 });
    expect((await mcp.call("discounts_get", { code: " freeship " })).discount).toMatchObject({ id: F.disc.freeship, type: "FREE_SHIPPING" });
    expect(await mcp.call("discounts_get", { code: "OTHER5" })).toMatchObject({ blocked: true, status: 404 });
    expect(await mcp.call("discounts_get", { discountId: F.disc.other })).toMatchObject({ blocked: true, status: 404 });
    expect((await mcp.call("discounts_generate_code")).code).toMatch(CODE_RE);
    expect(await prisma.discount.count({ where: { tenantId: HOUSE } })).toBe(2);
    await mcp.close();
  });

  it("discounts_create: preview (no row) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { code: "mcp25", type: "FIXED_AMOUNT", value: 2500, minimumOrderAmount: 10000 };
    const flow = await previewConfirmReplay(mcp, "discounts_create", args, async (preview) => {
      expect(preview.preview.discount).toMatchObject({ code: "MCP25", valueDescription: "$25.00 off", isActive: true });
      expect(await prisma.discount.count({ where: { code: "MCP25" } })).toBe(0);
    });
    expect(expectConfirmed(flow).discount).toMatchObject({ code: "MCP25", value: 2500, tenantId: HOUSE });
    expectReplayBlocked(flow);
    expect(await prisma.discount.count({ where: { code: "MCP25" } })).toBe(1);
    expect((await mcp.call("discounts_get", { code: "mcp25" })).discount).toMatchObject({ minimumOrderAmount: 10000 });
    await mcp.close();
  });

  it("discounts_create rejects bad values and duplicates at preview", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(await mcp.call("discounts_create", { code: "BIG", type: "PERCENTAGE", value: 150 })).toMatchObject({ blocked: true, status: 400 });
    expect(await mcp.call("discounts_create", { code: "ZERO", type: "FIXED_AMOUNT", value: 0 })).toMatchObject({ blocked: true, status: 400 });
    expect(await mcp.call("discounts_create", { code: "save10", type: "PERCENTAGE", value: 5 })).toMatchObject({ blocked: true, status: 409, existingDiscountId: F.disc.save10 });
    expect(await mcp.call("discounts_create", { code: "D", type: "PERCENTAGE", value: 5, endsAt: "nope" })).toMatchObject({ blocked: true, status: 400 });
    expect(await prisma.discount.count({ where: { tenantId: HOUSE } })).toBe(2);
    await mcp.close();
  });

  it("discounts_update: preview diff (no change) → confirm → replay blocked → read back; clear works", async () => {
    await prisma.discount.update({ where: { id: F.disc.save10 }, data: { usageLimit: 50 } });
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { discountId: F.disc.save10, value: 25, isActive: false, clear: ["usageLimit"] };
    const flow = await previewConfirmReplay(mcp, "discounts_update", args, async (preview) => {
      expect(preview.preview.changes).toMatchObject({ value: { from: 10, to: 25 }, isActive: { from: true, to: false }, usageLimit: { from: 50, to: null } });
      expect(await prisma.discount.findUnique({ where: { id: F.disc.save10 } })).toMatchObject({ value: 10, isActive: true, usageLimit: 50 });
    });
    expect(expectConfirmed(flow).discount).toMatchObject({ value: 25, isActive: false, usageLimit: null });
    expectReplayBlocked(flow);
    expect((await mcp.call("discounts_get", { discountId: F.disc.save10 })).discount).toMatchObject({ value: 25, isActive: false, usageLimit: null });
    await mcp.close();
  });

  it("discounts_update blocks invalid value, duplicate code, other store's id", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(await mcp.call("discounts_update", { discountId: F.disc.save10, value: 101 })).toMatchObject({ blocked: true, status: 400 });
    expect(await mcp.call("discounts_update", { discountId: F.disc.save10, code: "FREESHIP" })).toMatchObject({ blocked: true, status: 409 });
    expect(await mcp.call("discounts_update", { discountId: F.disc.other, value: 1 })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("discounts_delete: preview (row stays) → confirm → replay blocked → read 404", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { discountId: F.disc.save10 };
    const flow = await previewConfirmReplay(mcp, "discounts_delete", args, async (preview) => {
      expect(preview.preview).toMatchObject({ action: "delete", usageCount: 2, ordersUsingCode: 1 });
      expect(await prisma.discount.findUnique({ where: { id: F.disc.save10 } })).not.toBeNull();
    });
    expect(expectConfirmed(flow)).toEqual({ success: true });
    expectReplayBlocked(flow);
    expect(await mcp.call("discounts_get", { discountId: F.disc.save10 })).toMatchObject({ blocked: true, status: 404 });
    expect(await mcp.call("discounts_delete", { discountId: F.disc.other })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("discounts_delete confirmed after the row vanished reports 404, not 'unknown'", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const pv = await mcp.call("discounts_delete", { discountId: F.disc.freeship });
    await prisma.discount.delete({ where: { id: F.disc.freeship } });
    const r = await mcp.call("discounts_delete", { discountId: F.disc.freeship, confirmToken: pv.confirmToken });
    expect(r).toMatchObject({ done: false, blocked: true, status: 404 });
    await mcp.close();
  });

  it("other store's key only sees its own discounts", async () => {
    const mcp = await connectMcp(KEYS.otherAdmin);
    const l = await mcp.call("discounts_list");
    expect(l.discounts.map((d: { id: string }) => d.id)).toEqual([F.disc.other]);
    expect(await mcp.call("discounts_get", { discountId: F.disc.save10 })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });
});
