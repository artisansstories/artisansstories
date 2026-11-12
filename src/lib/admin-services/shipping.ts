/**
 * admin-services/shipping.ts — shipping zone/rate logic shared by
 * /api/admin/shipping/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). Additions:
 * read-only `preview*` functions used by MCP write tools.
 *
 * Units (match the admin UI): rate `price` is cents. `minValue`/`maxValue` are
 * cents for ORDER_VALUE rates (and FREE rates' "free over" threshold) and ounces
 * for WEIGHT rates.
 */
import { RateCondition, type ShippingRate } from "@prisma/client";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, fail } from "./result";

// ── zones: list / get ───────────────────────────────────────────────────────

export async function listZones(db: TenantPrisma) {
  const zones = await db.shippingZone.findMany({
    orderBy: { position: "asc" },
    include: {
      rates: { orderBy: { createdAt: "asc" } },
      _count: { select: { rates: true } },
    },
  });
  return ok({ zones });
}

export async function getZone(db: TenantPrisma, id: string) {
  const zone = await db.shippingZone.findUnique({
    where: { id },
    include: { rates: { orderBy: { createdAt: "asc" } } },
  });
  if (!zone) return fail(404, "Not found");
  return ok({ zone });
}

// ── zones: create ───────────────────────────────────────────────────────────

export interface RateInput {
  name: string;
  condition?: RateCondition;
  minValue?: number;
  maxValue?: number;
  price: number;
  isActive?: boolean;
}

export interface ZoneCreateBody {
  name?: string;
  countries?: string[];
  regions?: string[];
  isActive?: boolean;
  rates?: RateInput[];
}

export async function createZone(db: TenantPrisma, body: ZoneCreateBody) {
  const { name, countries, regions, isActive, rates } = body;
  if (!name?.trim()) {
    return fail(400, "Zone name is required");
  }
  // Get highest position for ordering
  const last = await db.shippingZone.findFirst({ orderBy: { position: "desc" } });
  const position = (last?.position ?? -1) + 1;
  const zone = await db.shippingZone.create({
    data: {
      tenantId: db.$tenantId,
      name: name.trim(),
      countries: countries ?? [],
      regions: regions ?? [],
      isActive: isActive ?? true,
      position,
      rates: rates?.length
        ? {
            create: rates.map((r: RateInput) => ({
              tenantId: db.$tenantId,
              name: r.name,
              condition: r.condition ?? RateCondition.FLAT,
              minValue: r.minValue ?? null,
              maxValue: r.maxValue ?? null,
              price: r.price ?? 0,
              isActive: r.isActive ?? true,
            })),
          }
        : undefined,
    },
    include: {
      rates: true,
      _count: { select: { rates: true } },
    },
  });
  return ok({ zone }, 201);
}

export async function previewCreateZone(db: TenantPrisma, body: ZoneCreateBody) {
  const { name, countries, regions, isActive, rates } = body;
  if (!name?.trim()) {
    return fail(400, "Zone name is required");
  }
  const last = await db.shippingZone.findFirst({ orderBy: { position: "desc" } });
  const position = (last?.position ?? -1) + 1;
  return ok({
    action: "create zone",
    zone: {
      name: name.trim(),
      countries: countries ?? [],
      regions: regions ?? [],
      isActive: isActive ?? true,
      position,
    },
    rates: (rates ?? []).map((r) => ({
      name: r.name,
      condition: r.condition ?? RateCondition.FLAT,
      minValue: r.minValue ?? null,
      maxValue: r.maxValue ?? null,
      price: r.price ?? 0,
      isActive: r.isActive ?? true,
    })),
  });
}

// ── zones: update ───────────────────────────────────────────────────────────

export interface ZoneUpdateBody {
  name?: string;
  countries?: string[];
  regions?: string[];
  isActive?: boolean;
  position?: number;
}

function zoneUpdateData(body: ZoneUpdateBody) {
  const { name, countries, regions, isActive, position } = body;
  return {
    ...(name !== undefined && { name: name.trim() }),
    ...(countries !== undefined && { countries }),
    ...(regions !== undefined && { regions }),
    ...(isActive !== undefined && { isActive }),
    ...(position !== undefined && { position }),
  };
}

export async function updateZone(db: TenantPrisma, id: string, body: ZoneUpdateBody) {
  const zone = await db.shippingZone.update({
    where: { id },
    data: zoneUpdateData(body),
    include: {
      rates: { orderBy: { createdAt: "asc" } },
      _count: { select: { rates: true } },
    },
  });
  return ok({ zone });
}

function diff(current: Record<string, unknown>, data: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(data)) {
    if (JSON.stringify(current[k]) !== JSON.stringify(v)) changes[k] = { from: current[k], to: v };
  }
  return changes;
}

export async function previewUpdateZone(db: TenantPrisma, id: string, body: ZoneUpdateBody) {
  const zone = await db.shippingZone.findUnique({ where: { id } });
  if (!zone) return fail(404, "Not found");
  const changes = diff(zone, zoneUpdateData(body));
  return ok({ action: "update zone", zoneId: id, zoneName: zone.name, changes, noChange: Object.keys(changes).length === 0 });
}

// ── zones: delete ───────────────────────────────────────────────────────────

export async function deleteZone(db: TenantPrisma, id: string) {
  await db.shippingZone.delete({ where: { id } });
  return ok({ success: true });
}

export async function previewDeleteZone(db: TenantPrisma, id: string) {
  const zone = await db.shippingZone.findUnique({
    where: { id },
    include: { rates: { orderBy: { createdAt: "asc" } } },
  });
  if (!zone) return fail(404, "Not found");
  const otherActiveZones = await db.shippingZone.count({ where: { isActive: true, NOT: { id } } });
  return ok({
    action: "delete zone",
    deletes: {
      zone: { id: zone.id, name: zone.name, countries: zone.countries, regions: zone.regions, isActive: zone.isActive },
      rates: zone.rates.map((r) => ({ id: r.id, name: r.name, condition: r.condition, price: r.price, isActive: r.isActive })),
    },
    ratesDeletedWithZone: zone.rates.length,
    otherActiveZones,
    effect:
      "The zone and ALL its rates are permanently deleted (rates cascade). Customers in these destinations get no shipping option from this zone at checkout. Existing orders are unaffected." +
      (otherActiveZones === 0 ? " WARNING: no other active shipping zone remains." : ""),
  });
}

// ── rates: create ───────────────────────────────────────────────────────────

export interface RateCreateBody {
  name?: string;
  condition?: RateCondition;
  minValue?: number;
  maxValue?: number;
  price?: number;
  isActive?: boolean;
}

export async function createRate(db: TenantPrisma, zoneId: string, body: RateCreateBody) {
  const { name, condition, minValue, maxValue, price, isActive } = body;
  if (!name?.trim()) {
    return fail(400, "Rate name is required");
  }
  // Verify zone exists
  const zone = await db.shippingZone.findUnique({ where: { id: zoneId } });
  if (!zone) return fail(404, "Zone not found");
  const rate = await db.shippingRate.create({
    data: {
      tenantId: db.$tenantId,
      zoneId,
      name: name.trim(),
      condition: condition ?? RateCondition.FLAT,
      minValue: minValue ?? null,
      maxValue: maxValue ?? null,
      price: condition === RateCondition.FREE ? 0 : (price ?? 0),
      isActive: isActive ?? true,
    },
  });
  return ok({ rate }, 201);
}

export async function previewCreateRate(db: TenantPrisma, zoneId: string, body: RateCreateBody) {
  const { name, condition, minValue, maxValue, price, isActive } = body;
  if (!name?.trim()) {
    return fail(400, "Rate name is required");
  }
  const zone = await db.shippingZone.findUnique({ where: { id: zoneId } });
  if (!zone) return fail(404, "Zone not found");
  return ok({
    action: "create rate",
    zone: { id: zone.id, name: zone.name },
    rate: {
      name: name.trim(),
      condition: condition ?? RateCondition.FLAT,
      minValue: minValue ?? null,
      maxValue: maxValue ?? null,
      price: condition === RateCondition.FREE ? 0 : (price ?? 0),
      isActive: isActive ?? true,
    },
  });
}

// ── rates: update ───────────────────────────────────────────────────────────

export interface RateUpdateBody {
  name?: string;
  condition?: RateCondition;
  minValue?: number | null;
  maxValue?: number | null;
  price?: number;
  isActive?: boolean;
}

function rateUpdateData(body: RateUpdateBody) {
  const { name, condition, minValue, maxValue, price, isActive } = body;
  return {
    ...(name !== undefined && { name: name.trim() }),
    ...(condition !== undefined && { condition }),
    ...(minValue !== undefined && { minValue }),
    ...(maxValue !== undefined && { maxValue }),
    ...(price !== undefined && {
      price: condition === RateCondition.FREE ? 0 : price,
    }),
    ...(isActive !== undefined && { isActive }),
  };
}

export async function updateRate(db: TenantPrisma, rateId: string, body: RateUpdateBody) {
  const rate = await db.shippingRate.update({
    where: { id: rateId },
    data: rateUpdateData(body),
  });
  return ok({ rate });
}

async function findRate(db: TenantPrisma, rateId: string, zoneId?: string) {
  const rate = await db.shippingRate.findUnique({
    where: { id: rateId },
    include: { zone: { select: { id: true, name: true } } },
  });
  if (!rate || (zoneId !== undefined && rate.zoneId !== zoneId)) return null;
  return rate;
}

export async function previewUpdateRate(db: TenantPrisma, rateId: string, body: RateUpdateBody, zoneId?: string) {
  const rate = await findRate(db, rateId, zoneId);
  if (!rate) return fail(404, "Rate not found");
  const changes = diff(rate as unknown as Record<string, unknown>, rateUpdateData(body));
  const after = { ...(rate as ShippingRate), ...rateUpdateData(body) };
  return ok({
    action: "update rate",
    rateId,
    rateName: rate.name,
    zone: rate.zone,
    changes,
    noChange: Object.keys(changes).length === 0,
    after: {
      name: after.name,
      condition: after.condition,
      minValue: after.minValue,
      maxValue: after.maxValue,
      price: after.price,
      isActive: after.isActive,
    },
  });
}

// ── rates: delete ───────────────────────────────────────────────────────────

export async function deleteRate(db: TenantPrisma, rateId: string) {
  await db.shippingRate.delete({ where: { id: rateId } });
  return ok({ success: true });
}

export async function previewDeleteRate(db: TenantPrisma, rateId: string, zoneId?: string) {
  const rate = await findRate(db, rateId, zoneId);
  if (!rate) return fail(404, "Rate not found");
  const remainingActiveRates = await db.shippingRate.count({
    where: { zoneId: rate.zoneId, isActive: true, NOT: { id: rateId } },
  });
  return ok({
    action: "delete rate",
    deletes: {
      id: rate.id,
      name: rate.name,
      condition: rate.condition,
      minValue: rate.minValue,
      maxValue: rate.maxValue,
      price: rate.price,
      isActive: rate.isActive,
    },
    zone: rate.zone,
    remainingActiveRatesInZone: remainingActiveRates,
    effect:
      "The rate is permanently deleted. Existing orders are unaffected." +
      (remainingActiveRates === 0 ? " WARNING: the zone will have no active rates left." : ""),
  });
}
