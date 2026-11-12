/**
 * Commerce domain, part 3: tax settings (GET/PUT /api/admin/tax, tax_get,
 * tax_update) and the tax-in-pixel-field bug.
 *
 * Tax used to be stored as 'TAX:{json}' in StoreSettings.facebookPixelId on the
 * house row only. It now lives in StoreSettings.taxSettings on the caller's own
 * row; prisma/migrations/add_store_tax_settings.sql moves legacy data. The
 * migration is run here against the local test database only.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked } from "../helpers/mcp";
import * as taxRoute from "@/app/api/admin/tax/route";
import * as settingsRoute from "@/app/api/admin/settings/route";

const h = (fn: unknown) => fn as never;
const DEFAULT_TAX = { stripeTaxEnabled: false, defaultTaxRate: 8.25, nexusStates: ["CA"] };
const LEGACY = 'TAX:{"stripeTaxEnabled":true,"defaultTaxRate":7,"nexusStates":["TX"]}';
const MIGRATION = fs.readFileSync(path.resolve(__dirname, "../../../prisma/migrations/add_store_tax_settings.sql"), "utf8");

const row = (id: string) => prisma.storeSettings.findUniqueOrThrow({ where: { id }, select: { taxSettings: true, facebookPixelId: true } });
const getTax = () => call(h(taxRoute.GET), "GET", "/api/admin/tax");
const putTax = (body: unknown) => call(h(taxRoute.PUT), "PUT", "/api/admin/tax", { body });
const getSettings = () => call(h(settingsRoute.GET), "GET", "/api/admin/settings");

async function withPg<T>(fn: (c: Client, notices: string[]) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL!;
  expect(new URL(url).hostname).toBe("127.0.0.1"); // never anything but the local test cluster
  const c = new Client({ connectionString: url });
  const notices: string[] = [];
  c.on("notice", (n) => notices.push(n.message ?? ""));
  await c.connect();
  try {
    return await fn(c, notices);
  } finally {
    await c.end();
  }
}

// ── auth ────────────────────────────────────────────────────────────────────

describe("tax routes require a session (401)", () => {
  it("GET /tax", async () => {
    expect((await getTax()).status).toBe(401);
  });
  it("PUT /tax (and nothing is written)", async () => {
    expect((await putTax({ stripeTaxEnabled: true, defaultTaxRate: 1, nexusStates: [] })).status).toBe(401);
    expect(await row(F.settings.house)).toEqual({ taxSettings: null, facebookPixelId: "1234567890" });
  });
});

// ── routes ──────────────────────────────────────────────────────────────────

describe("tax routes", () => {
  it("GET /tax returns defaults when never saved", async () => {
    await signInAs(F.admin.super);
    const r = await getTax();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(DEFAULT_TAX);
  });

  it("PUT /tax saves to taxSettings and leaves the Facebook Pixel ID untouched", async () => {
    await signInAs(F.admin.super);
    const body = { stripeTaxEnabled: true, defaultTaxRate: 6.5, nexusStates: ["TX", "NY"] };
    const r = await putTax(body);
    expect(r.status, r.text).toBe(200);
    expect(r.body).toEqual(body);
    expect(await row(F.settings.house)).toEqual({ taxSettings: body, facebookPixelId: "1234567890" });
    expect((await getTax()).body).toEqual(body);
    const s = await getSettings();
    expect(s.status).toBe(200);
    expect(s.body.facebookPixelId).toBe("1234567890");
    // The other store's row is not touched.
    expect(await row(F.settings.other)).toEqual({ taxSettings: null, facebookPixelId: null });
  });

  it("PUT /tax normalizes input (route replaces all three fields)", async () => {
    await signInAs(F.admin.super);
    const r = await putTax({ defaultTaxRate: "abc", nexusStates: ["CA", 5, null] });
    expect(r.body).toEqual({ stripeTaxEnabled: false, defaultTaxRate: 0, nexusStates: ["CA"] });
    expect((await row(F.settings.house)).taxSettings).toEqual({ stripeTaxEnabled: false, defaultTaxRate: 0, nexusStates: ["CA"] });
  });

  it("the other store reads and saves its own tax settings, independent of the house", async () => {
    await signInAs(F.admin.oSuper);
    expect((await getTax()).body).toEqual(DEFAULT_TAX);
    const otherTax = { stripeTaxEnabled: false, defaultTaxRate: 5, nexusStates: ["FL"] };
    const r = await putTax(otherTax);
    expect(r.status, r.text).toBe(200);
    expect(await row(F.settings.other)).toEqual({ taxSettings: otherTax, facebookPixelId: null });
    expect(await row(F.settings.house)).toEqual({ taxSettings: null, facebookPixelId: "1234567890" });

    await signInAs(F.admin.super);
    expect((await getTax()).body).toEqual(DEFAULT_TAX);
    const houseTax = { stripeTaxEnabled: true, defaultTaxRate: 8, nexusStates: ["CA", "TX"] };
    await putTax(houseTax);
    expect((await getTax()).body).toEqual(houseTax);

    await signInAs(F.admin.oSuper);
    expect((await getTax()).body).toEqual(otherTax);
  });

  it("PUT /tax creates the store's settings row when it has none", async () => {
    await prisma.storeSettings.delete({ where: { id: F.settings.other } });
    await signInAs(F.admin.oSuper);
    const t = { stripeTaxEnabled: true, defaultTaxRate: 3, nexusStates: [] };
    expect((await putTax(t)).status).toBe(200);
    const created = await prisma.storeSettings.findUniqueOrThrow({ where: { tenantId: OTHER } });
    expect(created.taxSettings).toEqual(t);
    expect((await getTax()).body).toEqual(t);
    expect(await prisma.storeSettings.count({ where: { tenantId: HOUSE } })).toBe(1);
  });

  it("a legacy 'TAX:' pixel value is read by GET /tax and hidden by GET /settings; PUT moves it out", async () => {
    await prisma.storeSettings.update({ where: { id: F.settings.house }, data: { facebookPixelId: LEGACY } });
    await signInAs(F.admin.super);
    expect((await getTax()).body).toEqual({ stripeTaxEnabled: true, defaultTaxRate: 7, nexusStates: ["TX"] });
    const s = await getSettings();
    expect(s.status).toBe(200);
    expect(s.body.facebookPixelId).toBeNull();

    const next = { stripeTaxEnabled: true, defaultTaxRate: 7.5, nexusStates: ["TX"] };
    await putTax(next);
    expect(await row(F.settings.house)).toEqual({ taxSettings: next, facebookPixelId: null });
    expect((await getTax()).body).toEqual(next);
  });

  it("a malformed legacy value falls back to defaults (no 500)", async () => {
    await prisma.storeSettings.update({ where: { id: F.settings.house }, data: { facebookPixelId: "TAX:not-json" } });
    await signInAs(F.admin.super);
    const r = await getTax();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(DEFAULT_TAX);
    expect((await getSettings()).body.facebookPixelId).toBeNull();
  });

  it("taxSettings wins over a leftover legacy value", async () => {
    const stored = { stripeTaxEnabled: false, defaultTaxRate: 4, nexusStates: ["WA"] };
    await prisma.storeSettings.update({ where: { id: F.settings.house }, data: { facebookPixelId: LEGACY, taxSettings: stored } });
    await signInAs(F.admin.super);
    expect((await getTax()).body).toEqual(stored);
  });
});

// ── MCP ─────────────────────────────────────────────────────────────────────

describe("tax MCP tools", () => {
  it("tax_get returns defaults, then the saved values", async () => {
    const mcp = await connectMcp(KEYS.houseRead);
    expect(await mcp.call("tax_get")).toEqual(DEFAULT_TAX);
    const saved = { stripeTaxEnabled: true, defaultTaxRate: 9, nexusStates: ["NV"] };
    await prisma.storeSettings.update({ where: { id: F.settings.house }, data: { taxSettings: saved } });
    expect(await mcp.call("tax_get")).toEqual(saved);
    await mcp.close();
  });

  it("tax_update: preview (no change) → confirm → replay blocked → read back; pixel untouched", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { stripeTaxEnabled: true, defaultTaxRate: 6.25, nexusStates: ["TX"] };
    const flow = await previewConfirmReplay(mcp, "tax_update", args, async (preview) => {
      expect(preview.preview).toMatchObject({ current: DEFAULT_TAX, after: args, storeSettingsRowExists: true });
      expect(Object.keys(preview.preview.changes).sort()).toEqual(["defaultTaxRate", "nexusStates", "stripeTaxEnabled"]);
      expect(await row(F.settings.house)).toEqual({ taxSettings: null, facebookPixelId: "1234567890" });
    });
    expect(expectConfirmed(flow)).toEqual(args);
    expectReplayBlocked(flow);
    expect(await mcp.call("tax_get")).toEqual(args);
    expect(await row(F.settings.house)).toEqual({ taxSettings: args, facebookPixelId: "1234567890" });
    await signInAs(F.admin.super);
    expect((await getSettings()).body.facebookPixelId).toBe("1234567890");
    await mcp.close();
  });

  it("tax_update with one field keeps the others", async () => {
    const start = { stripeTaxEnabled: true, defaultTaxRate: 5, nexusStates: ["CA", "NY"] };
    await prisma.storeSettings.update({ where: { id: F.settings.house }, data: { taxSettings: start } });
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "tax_update", { defaultTaxRate: 7.75 }, (preview) => {
      expect(preview.preview.changes).toEqual({ defaultTaxRate: { from: 5, to: 7.75 } });
    });
    expect(expectConfirmed(flow)).toEqual({ ...start, defaultTaxRate: 7.75 });
    expect(await mcp.call("tax_get")).toEqual({ ...start, defaultTaxRate: 7.75 });
    await mcp.close();
  });

  it("tax_update rejects an out-of-range rate", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    // Rejected by the SDK's input-schema check (isError) before the handler runs.
    const r = await mcp.call("tax_update", { defaultTaxRate: 150 });
    expect(r.isError === true || (r.blocked === true && r.status === 400), JSON.stringify(r)).toBe(true);
    expect(r.confirmToken).toBeUndefined();
    expect((await row(F.settings.house)).taxSettings).toBeNull();
    await mcp.close();
  });

  it("the other store's key reads and saves its own tax settings, independent of the house", async () => {
    const other = await connectMcp(KEYS.otherAdmin);
    expect(await other.call("tax_get")).toEqual(DEFAULT_TAX);
    const flow = await previewConfirmReplay(other, "tax_update", { nexusStates: ["FL"], defaultTaxRate: 6 });
    expect(expectConfirmed(flow)).toEqual({ stripeTaxEnabled: false, defaultTaxRate: 6, nexusStates: ["FL"] });
    expect(await row(F.settings.other)).toEqual({ taxSettings: { stripeTaxEnabled: false, defaultTaxRate: 6, nexusStates: ["FL"] }, facebookPixelId: null });
    await other.close();

    const house = await connectMcp(KEYS.houseAdmin);
    expect(await house.call("tax_get")).toEqual(DEFAULT_TAX);
    expect(await row(F.settings.house)).toEqual({ taxSettings: null, facebookPixelId: "1234567890" });
    expectConfirmed(await previewConfirmReplay(house, "tax_update", { stripeTaxEnabled: true }));
    await house.close();

    const otherAgain = await connectMcp(KEYS.otherRead);
    expect(await otherAgain.call("tax_get")).toEqual({ stripeTaxEnabled: false, defaultTaxRate: 6, nexusStates: ["FL"] });
    await otherAgain.close();
  });

  it("tax_get reads a legacy row; tax_update moves it out of the pixel field; settings_get hides it", async () => {
    await prisma.storeSettings.update({ where: { id: F.settings.house }, data: { facebookPixelId: LEGACY } });
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(await mcp.call("tax_get")).toEqual({ stripeTaxEnabled: true, defaultTaxRate: 7, nexusStates: ["TX"] });
    expect((await mcp.call("settings_get")).facebookPixelId ?? null).toBeNull();
    expectConfirmed(await previewConfirmReplay(mcp, "tax_update", { nexusStates: ["TX", "OK"] }));
    expect(await row(F.settings.house)).toEqual({ taxSettings: { stripeTaxEnabled: true, defaultTaxRate: 7, nexusStates: ["TX", "OK"] }, facebookPixelId: null });
    await mcp.close();
  });
});

// ── migration: prisma/migrations/add_store_tax_settings.sql ─────────────────

describe("add_store_tax_settings.sql migration", () => {
  /** Extra stores so every legacy shape can be checked in one run. */
  async function seedLegacyRows() {
    await prisma.tenant.createMany({
      data: [
        { id: "tenant_mig_bad", slug: "mig-bad", name: "Bad JSON" },
        { id: "tenant_mig_arr", slug: "mig-arr", name: "JSON array" },
        { id: "tenant_mig_both", slug: "mig-both", name: "Both set" },
      ],
    });
    await prisma.storeSettings.createMany({
      data: [
        { id: "mig_bad", tenantId: "tenant_mig_bad" },
        { id: "mig_arr", tenantId: "tenant_mig_arr" },
        { id: "mig_both", tenantId: "tenant_mig_both" },
      ],
    });
  }

  async function setLegacyValues(c: Client, withTaxColumn: boolean) {
    const set = async (id: string, pixel: string | null) => c.query(`UPDATE "StoreSettings" SET "facebookPixelId" = $1 WHERE "id" = $2`, [pixel, id]);
    await set(F.settings.house, LEGACY);
    await set(F.settings.other, "987654");
    await set("mig_bad", "TAX:not-json");
    await set("mig_arr", "TAX:[1,2]");
    await set("mig_both", 'TAX:{"stripeTaxEnabled":true,"defaultTaxRate":1,"nexusStates":["AK"]}');
    if (withTaxColumn) {
      await c.query(`UPDATE "StoreSettings" SET "taxSettings" = NULL`);
      await c.query(`UPDATE "StoreSettings" SET "taxSettings" = '{"stripeTaxEnabled":false,"defaultTaxRate":2,"nexusStates":["HI"]}'::jsonb WHERE "id" = 'mig_both'`);
    }
  }

  async function snapshot(c: Client) {
    const { rows } = await c.query(`SELECT "id", "facebookPixelId", "taxSettings" FROM "StoreSettings" ORDER BY "id"`);
    return Object.fromEntries(rows.map((r) => [r.id, { pixel: r.facebookPixelId, tax: r.taxSettings }]));
  }

  async function expectMigrated(c: Client, notices: string[], bothTax: unknown) {
    const snap = await snapshot(c);
    expect(snap[F.settings.house]).toEqual({ pixel: null, tax: { stripeTaxEnabled: true, defaultTaxRate: 7, nexusStates: ["TX"] } });
    expect(snap[F.settings.other]).toEqual({ pixel: "987654", tax: null });
    expect(snap.mig_bad).toEqual({ pixel: "TAX:not-json", tax: null });
    expect(snap.mig_arr).toEqual({ pixel: "TAX:[1,2]", tax: null });
    expect(snap.mig_both).toEqual({ pixel: null, tax: bothTax });
    expect(notices.some((n) => n.includes("mig_bad") && n.includes("not JSON"))).toBe(true);
    expect(notices.some((n) => n.includes("mig_arr") && n.includes("not a JSON object"))).toBe(true);
  }

  it("moves valid legacy data, leaves real pixel ids and malformed values alone, and is idempotent", async () => {
    await seedLegacyRows();
    await withPg(async (c, notices) => {
      await setLegacyValues(c, true);
      await c.query(MIGRATION);
      // Existing taxSettings wins over a leftover legacy value (COALESCE); the pixel field is still cleared.
      const bothTax = { stripeTaxEnabled: false, defaultTaxRate: 2, nexusStates: ["HI"] };
      await expectMigrated(c, notices, bothTax);
      const first = await snapshot(c);
      await c.query(MIGRATION); // second run: no error, no change
      expect(await snapshot(c)).toEqual(first);
    });

    // The app reads the migrated rows correctly.
    await signInAs(F.admin.super);
    expect((await getTax()).body).toEqual({ stripeTaxEnabled: true, defaultTaxRate: 7, nexusStates: ["TX"] });
    expect((await getSettings()).body.facebookPixelId).toBeNull();
    await signInAs(F.admin.oSuper);
    expect((await getTax()).body).toEqual(DEFAULT_TAX);
    expect((await getSettings()).body.facebookPixelId).toBe("987654");
  });

  it("works on a database without the taxSettings column yet (production state)", async () => {
    await seedLegacyRows();
    await withPg(async (c, notices) => {
      try {
        await c.query(`ALTER TABLE "StoreSettings" DROP COLUMN "taxSettings"`);
        await setLegacyValues(c, false);
        await c.query(MIGRATION);
        const { rows } = await c.query(
          `SELECT data_type FROM information_schema.columns WHERE table_name = 'StoreSettings' AND column_name = 'taxSettings'`,
        );
        expect(rows).toEqual([{ data_type: "jsonb" }]);
        await expectMigrated(c, notices, { stripeTaxEnabled: true, defaultTaxRate: 1, nexusStates: ["AK"] });
        const first = await snapshot(c);
        await c.query(MIGRATION);
        expect(await snapshot(c)).toEqual(first);
      } finally {
        // Never leave the shared test schema without the column.
        await c.query(`ALTER TABLE "StoreSettings" ADD COLUMN IF NOT EXISTS "taxSettings" JSONB`);
      }
    });
    await signInAs(F.admin.super);
    expect((await getTax()).body).toEqual({ stripeTaxEnabled: true, defaultTaxRate: 7, nexusStates: ["TX"] });
  });
});
