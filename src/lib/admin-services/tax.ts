/**
 * admin-services/tax.ts — tax settings logic shared by /api/admin/tax and MCP.
 *
 * Extracted verbatim from the route handler (behavior unchanged). Additions:
 * read-only `previewTaxUpdate` used by the MCP write tool.
 */
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok } from "./result";

// Tax settings are stored as a JSON string in StoreSettings.facebookPixelId
// using the prefix "TAX:" to distinguish from real pixel IDs.
// Note: This is a pragmatic workaround until the schema can be updated with
// dedicated tax fields.
const TAX_PREFIX = "TAX:";
const DEFAULT_TAX = { stripeTaxEnabled: false, defaultTaxRate: 8.25, nexusStates: ["CA"] };

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

export async function readTaxSettings(db: TenantPrisma) {
  try {
    const settings = await db.storeSettings.findUnique({ where: { id: "singleton" } });
    if (settings?.facebookPixelId?.startsWith(TAX_PREFIX)) {
      return JSON.parse(settings.facebookPixelId.slice(TAX_PREFIX.length));
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_TAX };
}

export async function getTaxSettings(db: TenantPrisma) {
  const taxSettings = await readTaxSettings(db);
  return ok(taxSettings);
}

function normalize(body: TaxUpdateBody): TaxSettings {
  const { stripeTaxEnabled, defaultTaxRate, nexusStates } = body;
  return {
    stripeTaxEnabled: Boolean(stripeTaxEnabled),
    defaultTaxRate: Number(defaultTaxRate) || 0,
    nexusStates: Array.isArray(nexusStates) ? nexusStates : [],
  };
}

export async function updateTaxSettings(db: TenantPrisma, body: TaxUpdateBody) {
  const taxSettings = normalize(body);
  await db.storeSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      tenantId: db.$tenantId,
      facebookPixelId: TAX_PREFIX + JSON.stringify(taxSettings),
    },
    update: {
      facebookPixelId: TAX_PREFIX + JSON.stringify(taxSettings),
    },
  });
  return ok(taxSettings);
}

export async function previewTaxUpdate(db: TenantPrisma, body: TaxUpdateBody) {
  const current = (await readTaxSettings(db)) as TaxSettings;
  const next = normalize(body);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(next) as (keyof TaxSettings)[]) {
    if (JSON.stringify(current[k]) !== JSON.stringify(next[k])) changes[k] = { from: current[k], to: next[k] };
  }
  const settings = await db.storeSettings.findUnique({
    where: { id: "singleton" },
    select: { facebookPixelId: true },
  });
  const pixel = settings?.facebookPixelId;
  const overwritesPixel = !!pixel && !pixel.startsWith(TAX_PREFIX);
  return ok({
    action: "update tax settings",
    current,
    after: next,
    changes,
    noChange: Object.keys(changes).length === 0,
    storeSettingsRowExists: !!settings,
    ...(overwritesPixel
      ? { warning: `Tax settings share storage with the Facebook Pixel ID field; saving will overwrite the current pixel ID "${pixel}".` }
      : {}),
  });
}
