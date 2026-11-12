/**
 * admin-services/tax.ts — tax settings logic shared by /api/admin/tax and MCP.
 *
 * Tax settings live in StoreSettings.taxSettings (JSON), on the caller's own
 * store row. They used to be packed into StoreSettings.facebookPixelId as
 * "TAX:{json}" on the house row only, which wiped a real Pixel ID on save and
 * broke for every other store; prisma/migrations/add_store_tax_settings.sql
 * moves that data. A leftover "TAX:" value is still read (never written) so a
 * row the migration skipped keeps working.
 */
import type { Prisma } from "@prisma/client";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok } from "./result";

const LEGACY_TAX_PREFIX = "TAX:";
const DEFAULT_TAX: TaxSettings = { stripeTaxEnabled: false, defaultTaxRate: 8.25, nexusStates: ["CA"] };

export interface TaxSettings {
  stripeTaxEnabled: boolean;
  defaultTaxRate: number;
  nexusStates: string[];
}

export interface TaxUpdateBody {
  stripeTaxEnabled?: unknown;
  defaultTaxRate?: unknown;
  nexusStates?: unknown;
}

/** True when a facebookPixelId value is legacy tax data, not a Pixel ID. */
export function isLegacyTaxValue(pixelId: string | null | undefined): boolean {
  return !!pixelId?.startsWith(LEGACY_TAX_PREFIX);
}

function fromJson(value: unknown): TaxSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return normalize(value as TaxUpdateBody);
}

export async function readTaxSettings(db: TenantPrisma): Promise<TaxSettings> {
  const settings = await db.storeSettings.findFirst({
    where: {},
    select: { taxSettings: true, facebookPixelId: true },
  });
  const stored = fromJson(settings?.taxSettings);
  if (stored) return stored;
  if (isLegacyTaxValue(settings?.facebookPixelId)) {
    try {
      const legacy = fromJson(JSON.parse(settings!.facebookPixelId!.slice(LEGACY_TAX_PREFIX.length)));
      if (legacy) return legacy;
    } catch {
      // fall through to defaults
    }
  }
  return { ...DEFAULT_TAX, nexusStates: [...DEFAULT_TAX.nexusStates] };
}

export async function getTaxSettings(db: TenantPrisma) {
  return ok(await readTaxSettings(db));
}

function normalize(body: TaxUpdateBody): TaxSettings {
  const { stripeTaxEnabled, defaultTaxRate, nexusStates } = body;
  return {
    stripeTaxEnabled: Boolean(stripeTaxEnabled),
    defaultTaxRate: Number(defaultTaxRate) || 0,
    nexusStates: Array.isArray(nexusStates) ? nexusStates.filter((s): s is string => typeof s === "string") : [],
  };
}

export async function updateTaxSettings(db: TenantPrisma, body: TaxUpdateBody) {
  const taxSettings = normalize(body);
  const json = taxSettings as unknown as Prisma.InputJsonValue;
  const existing = await db.storeSettings.findFirst({ where: {}, select: { id: true, facebookPixelId: true } });
  if (existing) {
    await db.storeSettings.update({
      where: { id: existing.id },
      data: {
        taxSettings: json,
        // Clear a leftover legacy value so the Pixel ID field isn't stuck with it.
        ...(isLegacyTaxValue(existing.facebookPixelId) ? { facebookPixelId: null } : {}),
      },
    });
  } else {
    await db.storeSettings.create({ data: { tenantId: db.$tenantId, taxSettings: json } });
  }
  return ok(taxSettings);
}

export async function previewTaxUpdate(db: TenantPrisma, body: TaxUpdateBody) {
  const current = await readTaxSettings(db);
  const next = normalize(body);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(next) as (keyof TaxSettings)[]) {
    if (JSON.stringify(current[k]) !== JSON.stringify(next[k])) changes[k] = { from: current[k], to: next[k] };
  }
  const settings = await db.storeSettings.findFirst({ where: {}, select: { id: true } });
  return ok({
    action: "update tax settings",
    current,
    after: next,
    changes,
    noChange: Object.keys(changes).length === 0,
    storeSettingsRowExists: !!settings,
  });
}
