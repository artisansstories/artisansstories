/**
 * Commerce domain, part 2: shipping zones and rates.
 * Every route+method under /api/admin/shipping/** and every shipping_* MCP tool.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked } from "../helpers/mcp";
import * as zonesRoute from "@/app/api/admin/shipping/route";
import * as zoneRoute from "@/app/api/admin/shipping/[id]/route";
import * as ratesRoute from "@/app/api/admin/shipping/[id]/rates/route";
import * as rateRoute from "@/app/api/admin/shipping/[id]/rates/[rateId]/route";

const h = (fn: unknown) => fn as never;
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();
const zonePath = (id: string) => `/api/admin/shipping/${id}`;
const ratePath = (zoneId: string, rateId: string) => `/api/admin/shipping/${zoneId}/rates/${rateId}`;

async function addFreeRate(price = 0) {
  return prisma.shippingRate.create({ data: { id: "h_rate_tmp_free", tenantId: HOUSE, zoneId: F.zone.us, name: "Free", condition: "FREE", minValue: 5000, price } });
}

// ── auth ────────────────────────────────────────────────────────────────────

describe("shipping routes require a session (401)", () => {
  const cases: [string, unknown, string, string, Record<string, string>?, unknown?][] = [
    ["GET /shipping", zonesRoute.GET, "GET", "/api/admin/shipping"],
    ["POST /shipping", zonesRoute.POST, "POST", "/api/admin/shipping", undefined, { name: "NoAuth" }],
    ["GET /shipping/[id]", zoneRoute.GET, "GET", zonePath(F.zone.us), { id: F.zone.us }],
    ["PUT /shipping/[id]", zoneRoute.PUT, "PUT", zonePath(F.zone.us), { id: F.zone.us }, { name: "Hacked" }],
    ["DELETE /shipping/[id]", zoneRoute.DELETE, "DELETE", zonePath(F.zone.us), { id: F.zone.us }],
    ["POST /shipping/[id]/rates", ratesRoute.POST, "POST", `${zonePath(F.zone.us)}/rates`, { id: F.zone.us }, { name: "NoAuth", price: 1 }],
    ["PUT /shipping/[id]/rates/[rateId]", rateRoute.PUT, "PUT", ratePath(F.zone.us, F.rate.usStandard), { id: F.zone.us, rateId: F.rate.usStandard }, { price: 1 }],
    ["DELETE /shipping/[id]/rates/[rateId]", rateRoute.DELETE, "DELETE", ratePath(F.zone.us, F.rate.usStandard), { id: F.zone.us, rateId: F.rate.usStandard }],
  ];
  for (const [label, fn, method, path, params, body] of cases) {
    it(label, async () => {
      const r = await call(h(fn), method, path, { params, body });
      expect(r.status, r.text).toBe(401);
    });
  }
  it("no unauthenticated write reached the database", async () => {
    for (const [, fn, method, path, params, body] of cases) await call(h(fn), method, path, { params, body });
    expect(await prisma.shippingZone.findUnique({ where: { id: F.zone.us } })).toMatchObject({ name: "United States" });
    expect(await prisma.shippingRate.findUnique({ where: { id: F.rate.usStandard } })).toMatchObject({ price: 800 });
    expect(await prisma.shippingZone.count({ where: { name: "NoAuth" } })).toBe(0);
    expect(await prisma.shippingRate.count({ where: { name: "NoAuth" } })).toBe(0);
  });
});

// ── zones: routes ───────────────────────────────────────────────────────────

describe("shipping zone routes", () => {
  it("GET /shipping lists house zones in priority order with rates and counts", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(zonesRoute.GET), "GET", "/api/admin/shipping");
    expect(r.status).toBe(200);
    expect(r.body.zones.map((z: { id: string }) => z.id)).toEqual([F.zone.us, F.zone.intl]);
    expect(r.body.zones[0]).toMatchObject({ name: "United States", countries: ["US"], regions: ["TX", "CA"], _count: { rates: 2 } });
    expect(ids(r.body.zones[0].rates)).toEqual([F.rate.usFree, F.rate.usStandard].sort());
    expect(r.body.zones[1].rates[0]).toMatchObject({ id: F.rate.intl, price: 2500, condition: "FLAT" });
  });

  it("POST /shipping creates a zone (last position) with initial rates; GET reads it back", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(zonesRoute.POST), "POST", "/api/admin/shipping", {
      body: { name: "  Europe ", countries: ["DE", "FR"], rates: [{ name: "EU Flat", price: 3000 }, { name: "EU Heavy", condition: "WEIGHT", minValue: 32, price: 6000 }] },
    });
    expect(r.status, r.text).toBe(201);
    expect(r.body.zone).toMatchObject({ name: "Europe", countries: ["DE", "FR"], regions: [], isActive: true, position: 2, tenantId: HOUSE, _count: { rates: 2 } });
    const g = await call(h(zoneRoute.GET), "GET", zonePath(r.body.zone.id), { params: { id: r.body.zone.id } });
    expect(g.status).toBe(200);
    const rates = g.body.zone.rates.map((x: { name: string; condition: string; price: number; minValue: number | null }) => [x.name, x.condition, x.price, x.minValue]).sort();
    expect(rates).toEqual([["EU Flat", "FLAT", 3000, null], ["EU Heavy", "WEIGHT", 6000, 32]]);
  });

  it("POST /shipping without a name is 400", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(zonesRoute.POST), "POST", "/api/admin/shipping", { body: { name: "   " } });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Zone name is required" });
  });

  it("GET /shipping/[id] 404 for missing and other store's zone", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.zone.other]) {
      const r = await call(h(zoneRoute.GET), "GET", zonePath(id), { params: { id } });
      expect(r.status).toBe(404);
    }
  });

  it("PUT /shipping/[id] updates; GET reads it back", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(zoneRoute.PUT), "PUT", zonePath(F.zone.intl), {
      params: { id: F.zone.intl }, body: { name: " World ", countries: ["MX"], isActive: false, position: 5 },
    });
    expect(r.status, r.text).toBe(200);
    expect(r.body.zone).toMatchObject({ name: "World", countries: ["MX"], isActive: false, position: 5, _count: { rates: 1 } });
    const g = await call(h(zoneRoute.GET), "GET", zonePath(F.zone.intl), { params: { id: F.zone.intl } });
    expect(g.body.zone).toMatchObject({ name: "World", countries: ["MX"], regions: [], isActive: false, position: 5 });
  });

  it("PUT /shipping/[id] 404 (not 500) for missing and other store's zone", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.zone.other]) {
      const r = await call(h(zoneRoute.PUT), "PUT", zonePath(id), { params: { id }, body: { name: "Hijack" } });
      expect(r.status, r.text).toBe(404);
    }
    expect((await prisma.shippingZone.findUnique({ where: { id: F.zone.other } }))!.name).toBe("Other Zone");
  });

  it("DELETE /shipping/[id] deletes the zone and cascades its rates", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(zoneRoute.DELETE), "DELETE", zonePath(F.zone.us), { params: { id: F.zone.us } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    const l = await call(h(zonesRoute.GET), "GET", "/api/admin/shipping");
    expect(l.body.zones.map((z: { id: string }) => z.id)).toEqual([F.zone.intl]);
    expect(await prisma.shippingRate.count({ where: { zoneId: F.zone.us } })).toBe(0);
  });

  it("DELETE /shipping/[id] 404 (not 500) for missing and other store's zone", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.zone.other]) {
      const r = await call(h(zoneRoute.DELETE), "DELETE", zonePath(id), { params: { id } });
      expect(r.status, r.text).toBe(404);
    }
    expect(await prisma.shippingZone.findUnique({ where: { id: F.zone.other } })).not.toBeNull();
  });

  it("other store's admin sees only its own zones", async () => {
    await signInAs(F.admin.oSuper);
    const l = await call(h(zonesRoute.GET), "GET", "/api/admin/shipping");
    expect(l.body.zones.map((z: { id: string }) => z.id)).toEqual([F.zone.other]);
    const g = await call(h(zoneRoute.GET), "GET", zonePath(F.zone.us), { params: { id: F.zone.us } });
    expect(g.status).toBe(404);
  });
});

// ── rates: routes ───────────────────────────────────────────────────────────

describe("shipping rate routes", () => {
  it("POST /shipping/[id]/rates creates a rate; GET zone reads it back", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(ratesRoute.POST), "POST", `${zonePath(F.zone.intl)}/rates`, {
      params: { id: F.zone.intl }, body: { name: " Express ", condition: "ORDER_VALUE", minValue: 0, maxValue: 9999, price: 4500 },
    });
    expect(r.status, r.text).toBe(201);
    expect(r.body.rate).toMatchObject({ name: "Express", zoneId: F.zone.intl, condition: "ORDER_VALUE", minValue: 0, maxValue: 9999, price: 4500, isActive: true, tenantId: HOUSE });
    const g = await call(h(zoneRoute.GET), "GET", zonePath(F.zone.intl), { params: { id: F.zone.intl } });
    expect(ids(g.body.zone.rates)).toEqual([F.rate.intl, r.body.rate.id].sort());
  });

  it("POST rate with condition FREE forces price 0", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(ratesRoute.POST), "POST", `${zonePath(F.zone.us)}/rates`, { params: { id: F.zone.us }, body: { name: "Free", condition: "FREE", price: 999 } });
    expect(r.status).toBe(201);
    expect(r.body.rate).toMatchObject({ condition: "FREE", price: 0 });
  });

  it("POST rate: 400 without name, 404 for missing / other store's zone", async () => {
    await signInAs(F.admin.super);
    const noName = await call(h(ratesRoute.POST), "POST", `${zonePath(F.zone.us)}/rates`, { params: { id: F.zone.us }, body: { price: 100 } });
    expect(noName.status).toBe(400);
    for (const id of ["nope", F.zone.other]) {
      const r = await call(h(ratesRoute.POST), "POST", `${zonePath(id)}/rates`, { params: { id }, body: { name: "X", price: 1 } });
      expect(r.status).toBe(404);
    }
    expect(await prisma.shippingRate.count({ where: { zoneId: F.zone.other } })).toBe(1);
  });

  it("PUT /shipping/[id]/rates/[rateId] updates; GET zone reads it back", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(rateRoute.PUT), "PUT", ratePath(F.zone.us, F.rate.usStandard), {
      params: { id: F.zone.us, rateId: F.rate.usStandard }, body: { name: "Ground", price: 950, maxValue: 5000, isActive: false },
    });
    expect(r.status, r.text).toBe(200);
    expect(r.body.rate).toMatchObject({ id: F.rate.usStandard, name: "Ground", price: 950, maxValue: 5000, isActive: false });
    const g = await call(h(zoneRoute.GET), "GET", zonePath(F.zone.us), { params: { id: F.zone.us } });
    expect(g.body.zone.rates.find((x: { id: string }) => x.id === F.rate.usStandard)).toMatchObject({ name: "Ground", price: 950, isActive: false });
  });

  it("PUT rate: price with condition FREE in the same request is stored as 0", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(rateRoute.PUT), "PUT", ratePath(F.zone.us, F.rate.usStandard), {
      params: { id: F.zone.us, rateId: F.rate.usStandard }, body: { condition: "FREE", price: 700 },
    });
    expect(r.body.rate).toMatchObject({ condition: "FREE", price: 0 });
  });

  it("PUT rate: a stored FREE rate keeps price 0 when only price is sent", async () => {
    await signInAs(F.admin.super);
    await addFreeRate();
    const r = await call(h(rateRoute.PUT), "PUT", ratePath(F.zone.us, "h_rate_tmp_free"), {
      params: { id: F.zone.us, rateId: "h_rate_tmp_free" }, body: { price: 300 },
    });
    expect(r.status, r.text).toBe(200);
    expect(r.body.rate).toMatchObject({ condition: "FREE", price: 0 });
    expect((await prisma.shippingRate.findUnique({ where: { id: "h_rate_tmp_free" } }))!.price).toBe(0);
  });

  it("PUT rate: switching to FREE without a price zeroes the price; switching away from FREE takes the new price", async () => {
    await signInAs(F.admin.super);
    const toFree = await call(h(rateRoute.PUT), "PUT", ratePath(F.zone.us, F.rate.usStandard), {
      params: { id: F.zone.us, rateId: F.rate.usStandard }, body: { condition: "FREE" },
    });
    expect(toFree.body.rate).toMatchObject({ condition: "FREE", price: 0 });
    const back = await call(h(rateRoute.PUT), "PUT", ratePath(F.zone.us, F.rate.usStandard), {
      params: { id: F.zone.us, rateId: F.rate.usStandard }, body: { condition: "FLAT", price: 650 },
    });
    expect(back.body.rate).toMatchObject({ condition: "FLAT", price: 650 });
  });

  it("PUT rate 404 when the rate is missing, belongs to another zone, or another store", async () => {
    await signInAs(F.admin.super);
    const cases: [string, string][] = [
      [F.zone.us, "nope"],
      [F.zone.intl, F.rate.usStandard], // rate exists but is in zone us
      [F.zone.other, F.rate.other],
      [F.zone.us, F.rate.other],
    ];
    for (const [id, rateId] of cases) {
      const r = await call(h(rateRoute.PUT), "PUT", ratePath(id, rateId), { params: { id, rateId }, body: { price: 1 } });
      expect(r.status, `${id}/${rateId}: ${r.text}`).toBe(404);
    }
    expect((await prisma.shippingRate.findUnique({ where: { id: F.rate.usStandard } }))!.price).toBe(800);
    expect((await prisma.shippingRate.findUnique({ where: { id: F.rate.other } }))!.price).toBe(500);
  });

  it("DELETE /shipping/[id]/rates/[rateId] deletes; GET zone no longer lists it", async () => {
    await signInAs(F.admin.super);
    const r = await call(h(rateRoute.DELETE), "DELETE", ratePath(F.zone.us, F.rate.usFree), { params: { id: F.zone.us, rateId: F.rate.usFree } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    const g = await call(h(zoneRoute.GET), "GET", zonePath(F.zone.us), { params: { id: F.zone.us } });
    expect(ids(g.body.zone.rates)).toEqual([F.rate.usStandard]);
  });

  it("DELETE rate 404 when the rate is missing, belongs to another zone, or another store", async () => {
    await signInAs(F.admin.super);
    const cases: [string, string][] = [
      [F.zone.us, "nope"],
      [F.zone.intl, F.rate.usStandard],
      [F.zone.other, F.rate.other],
      [F.zone.us, F.rate.other],
    ];
    for (const [id, rateId] of cases) {
      const r = await call(h(rateRoute.DELETE), "DELETE", ratePath(id, rateId), { params: { id, rateId } });
      expect(r.status, `${id}/${rateId}: ${r.text}`).toBe(404);
    }
    expect(await prisma.shippingRate.findUnique({ where: { id: F.rate.usStandard } })).not.toBeNull();
    expect(await prisma.shippingRate.findUnique({ where: { id: F.rate.other } })).not.toBeNull();
  });
});

// ── MCP ─────────────────────────────────────────────────────────────────────

describe("shipping MCP tools", () => {
  it("shipping_zones_list returns seeded zones and rates (house key) and only the other store's (other key)", async () => {
    const mcp = await connectMcp(KEYS.houseRead);
    const l = await mcp.call("shipping_zones_list");
    expect(l.zones.map((z: { id: string }) => z.id)).toEqual([F.zone.us, F.zone.intl]);
    expect(ids(l.zones[0].rates)).toEqual([F.rate.usFree, F.rate.usStandard].sort());
    await mcp.close();
    const other = await connectMcp(KEYS.otherRead);
    expect((await other.call("shipping_zones_list")).zones.map((z: { id: string }) => z.id)).toEqual([F.zone.other]);
    await other.close();
  });

  it("shipping_zone_create: preview (no row) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { name: "Canada", countries: ["CA"], rates: [{ name: "CA Flat", price: 1800 }] };
    const flow = await previewConfirmReplay(mcp, "shipping_zone_create", args, async (preview) => {
      expect(preview.preview).toMatchObject({ zone: { name: "Canada", position: 2 }, rates: [{ name: "CA Flat", condition: "FLAT", price: 1800 }] });
      expect(await prisma.shippingZone.count({ where: { tenantId: HOUSE } })).toBe(2);
    });
    const zone = expectConfirmed(flow).zone;
    expect(zone).toMatchObject({ name: "Canada", position: 2, _count: { rates: 1 } });
    expectReplayBlocked(flow);
    expect(await prisma.shippingZone.count({ where: { tenantId: HOUSE } })).toBe(3);
    const l = await mcp.call("shipping_zones_list");
    expect(l.zones[2]).toMatchObject({ id: zone.id, name: "Canada", rates: [{ name: "CA Flat", price: 1800 }] });
    await mcp.close();
  });

  it("shipping_zone_update: preview (no change) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { zoneId: F.zone.us, regions: ["TX", "CA", "NY"], isActive: false };
    const flow = await previewConfirmReplay(mcp, "shipping_zone_update", args, async (preview) => {
      expect(preview.preview.changes).toEqual({ regions: { from: ["TX", "CA"], to: ["TX", "CA", "NY"] }, isActive: { from: true, to: false } });
      expect(await prisma.shippingZone.findUnique({ where: { id: F.zone.us } })).toMatchObject({ regions: ["TX", "CA"], isActive: true });
    });
    expect(expectConfirmed(flow).zone).toMatchObject({ regions: ["TX", "CA", "NY"], isActive: false });
    expectReplayBlocked(flow);
    expect((await mcp.call("shipping_zones_list")).zones[0]).toMatchObject({ id: F.zone.us, regions: ["TX", "CA", "NY"], isActive: false });
    expect(await mcp.call("shipping_zone_update", { zoneId: F.zone.other, name: "x" })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("shipping_zone_delete: preview lists cascading rates (no change) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { zoneId: F.zone.us };
    const flow = await previewConfirmReplay(mcp, "shipping_zone_delete", args, async (preview) => {
      expect(preview.preview).toMatchObject({ ratesDeletedWithZone: 2, otherActiveZones: 1 });
      expect(await prisma.shippingZone.findUnique({ where: { id: F.zone.us } })).not.toBeNull();
    });
    expect(expectConfirmed(flow)).toEqual({ success: true });
    expectReplayBlocked(flow);
    expect((await mcp.call("shipping_zones_list")).zones.map((z: { id: string }) => z.id)).toEqual([F.zone.intl]);
    expect(await prisma.shippingRate.count({ where: { zoneId: F.zone.us } })).toBe(0);
    expect(await mcp.call("shipping_zone_delete", { zoneId: F.zone.other })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("shipping_rate_create: preview (no row) → confirm → replay blocked → read back; FREE forces 0", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { zoneId: F.zone.intl, name: "Free intl", condition: "FREE", minValue: 20000, price: 1234 };
    const flow = await previewConfirmReplay(mcp, "shipping_rate_create", args, async (preview) => {
      expect(preview.preview.rate).toMatchObject({ condition: "FREE", price: 0, minValue: 20000 });
      expect(await prisma.shippingRate.count({ where: { zoneId: F.zone.intl } })).toBe(1);
    });
    const rate = expectConfirmed(flow).rate;
    expect(rate).toMatchObject({ zoneId: F.zone.intl, condition: "FREE", price: 0 });
    expectReplayBlocked(flow);
    const l = await mcp.call("shipping_zones_list");
    expect(ids(l.zones[1].rates)).toEqual([F.rate.intl, rate.id].sort());
    expect(await mcp.call("shipping_rate_create", { zoneId: F.zone.other, name: "x" })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("shipping_rate_update: preview (no change) → confirm → replay blocked → read back; clear works", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { rateId: F.rate.usFree, minValue: 15000, name: "Free over $150" };
    const flow = await previewConfirmReplay(mcp, "shipping_rate_update", args, async (preview) => {
      expect(preview.preview.changes).toEqual({ name: { from: "Free over $100", to: "Free over $150" }, minValue: { from: 10000, to: 15000 } });
      expect((await prisma.shippingRate.findUnique({ where: { id: F.rate.usFree } }))!.minValue).toBe(10000);
    });
    expect(expectConfirmed(flow).rate).toMatchObject({ minValue: 15000, name: "Free over $150" });
    expectReplayBlocked(flow);
    const cleared = await previewConfirmReplay(mcp, "shipping_rate_update", { rateId: F.rate.usFree, clear: ["minValue"] });
    expect(expectConfirmed(cleared).rate.minValue).toBeNull();
    const l = await mcp.call("shipping_zones_list");
    expect(l.zones[0].rates.find((r: { id: string }) => r.id === F.rate.usFree)).toMatchObject({ minValue: null, name: "Free over $150" });
    expect(await mcp.call("shipping_rate_update", { rateId: F.rate.other, price: 1 })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("shipping_rate_update on a stored FREE rate keeps price 0 (preview and write)", async () => {
    await addFreeRate();
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "shipping_rate_update", { rateId: "h_rate_tmp_free", price: 300 }, (preview) => {
      expect(preview.preview.after).toMatchObject({ condition: "FREE", price: 0 });
    });
    expect(expectConfirmed(flow).rate).toMatchObject({ condition: "FREE", price: 0 });
    expect((await prisma.shippingRate.findUnique({ where: { id: "h_rate_tmp_free" } }))!.price).toBe(0);
    await mcp.close();
  });

  it("shipping_rate_delete: preview (row stays) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { rateId: F.rate.intl };
    const flow = await previewConfirmReplay(mcp, "shipping_rate_delete", args, async (preview) => {
      expect(preview.preview).toMatchObject({ remainingActiveRatesInZone: 0, deletes: { id: F.rate.intl, price: 2500 } });
      expect(preview.preview.effect).toContain("WARNING");
      expect(await prisma.shippingRate.findUnique({ where: { id: F.rate.intl } })).not.toBeNull();
    });
    expect(expectConfirmed(flow)).toEqual({ success: true });
    expectReplayBlocked(flow);
    expect((await mcp.call("shipping_zones_list")).zones[1].rates).toEqual([]);
    expect(await mcp.call("shipping_rate_delete", { rateId: F.rate.other })).toMatchObject({ blocked: true, status: 404 });
    expect(await prisma.shippingRate.findUnique({ where: { id: F.rate.other } })).not.toBeNull();
    await mcp.close();
  });
});
