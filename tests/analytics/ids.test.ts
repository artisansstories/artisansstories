import { describe, it, expect, vi } from "vitest";

// Tracking-ID formats, save-time validation (settings service, shared with
// MCP settings_update), and the storefront loader's own re-validation.

const row = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    storeSettings: { findFirst: async () => row.current },
    tenantTheme: { findUnique: async () => null },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "artisansstories.com" }) }));

import {
  validGaId,
  validPixelId,
  gaStatus,
  pixelStatus,
  validateTrackingIds,
  GA_ID_ERROR,
  PIXEL_ID_ERROR,
} from "@/lib/analytics-ids";
import { updateSettings, previewUpdateSettings } from "@/lib/admin-services/settings";
import StoreAnalytics from "@/components/StoreAnalytics";
import type { TenantPrisma } from "@/lib/tenant-prisma";

describe("tracking ID formats", () => {
  it("accepts GA4 Measurement IDs, normalizing case and whitespace", () => {
    expect(validGaId("G-AB12CD34EF")).toBe("G-AB12CD34EF");
    expect(validGaId("  g-ab12cd34ef ")).toBe("G-AB12CD34EF");
  });
  it("rejects non-GA4 IDs", () => {
    for (const v of ["UA-12345-1", "G-ABC", "GTM-ABCD12", "G-AB12 CD34", "AB12CD34EF", "", null, 42]) {
      expect(validGaId(v)).toBeNull();
    }
  });
  it("accepts 15–16 digit Pixel IDs only", () => {
    expect(validPixelId("123456789012345")).toBe("123456789012345");
    expect(validPixelId("1234 5678 9012 3456")).toBe("1234567890123456");
    for (const v of ["12345678901234", "12345678901234567", "12345678901234a", "", null]) {
      expect(validPixelId(v)).toBeNull();
    }
  });
  it("treats legacy TAX: values in the Pixel field as not set", () => {
    const legacy = 'TAX:{"stripeTaxEnabled":false,"defaultTaxRate":8.25,"nexusStates":["CA"]}';
    expect(validPixelId(legacy)).toBeNull();
    expect(pixelStatus(legacy)).toBe("not_set");
  });
  it("reports Active / Not set / Invalid", () => {
    expect(gaStatus("G-AB12CD34EF")).toBe("active");
    expect(gaStatus("  ")).toBe("not_set");
    expect(gaStatus("UA-1-1")).toBe("invalid");
    expect(pixelStatus("123456789012345")).toBe("active");
    expect(pixelStatus(null)).toBe("not_set");
    expect(pixelStatus("12345")).toBe("invalid");
  });
});

describe("validateTrackingIds (save-time)", () => {
  it("normalizes valid values and blanks to null", () => {
    const data: Record<string, unknown> = { googleAnalyticsId: " g-ab12cd34ef ", facebookPixelId: "" };
    expect(validateTrackingIds(data)).toBeNull();
    expect(data).toEqual({ googleAnalyticsId: "G-AB12CD34EF", facebookPixelId: null });
  });
  it("leaves absent fields alone", () => {
    const data: Record<string, unknown> = { storeName: "x" };
    expect(validateTrackingIds(data)).toBeNull();
    expect(data).toEqual({ storeName: "x" });
  });
  it("returns a friendly error for bad formats", () => {
    expect(validateTrackingIds({ googleAnalyticsId: "UA-123-1" })).toBe(GA_ID_ERROR);
    expect(validateTrackingIds({ facebookPixelId: "abc" })).toBe(PIXEL_ID_ERROR);
    expect(validateTrackingIds({ facebookPixelId: "TAX:{}" })).toBe(PIXEL_ID_ERROR);
    expect(GA_ID_ERROR).toContain("G-AB12CD34EF");
  });
});

function fakeDb(existing: Record<string, unknown> | null) {
  const writes: Record<string, unknown>[] = [];
  const db = {
    $tenantId: "tenant_a",
    storeSettings: {
      findFirst: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return { ...existing, ...data };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return { id: "new", facebookPixelId: null, ...data };
      },
    },
  };
  return { db: db as unknown as TenantPrisma, writes };
}

describe("settings service (Settings API + MCP settings_update)", () => {
  const actor = { role: "ADMIN" };

  it("rejects a malformed GA ID with a 400 and writes nothing", async () => {
    const { db, writes } = fakeDb({ id: "s1", storeEnabled: true, facebookPixelId: null });
    const res = await updateSettings(db, { googleAnalyticsId: "UA-123-1" }, actor);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(GA_ID_ERROR);
    }
    expect(writes).toHaveLength(0);
  });

  it("rejects a malformed Pixel ID in preview too", async () => {
    const { db } = fakeDb({ id: "s1", storeEnabled: true, facebookPixelId: null });
    const res = await previewUpdateSettings(db, { facebookPixelId: "12345" }, actor);
    expect(res.ok).toBe(false);
  });

  it("saves normalized IDs", async () => {
    const { db, writes } = fakeDb({ id: "s1", storeEnabled: true, facebookPixelId: null });
    const res = await updateSettings(db, { googleAnalyticsId: "g-ab12cd34ef", facebookPixelId: "123456789012345" }, actor);
    expect(res.ok).toBe(true);
    expect(writes[0]).toEqual({ googleAnalyticsId: "G-AB12CD34EF", facebookPixelId: "123456789012345" });
  });

  it("a blank Pixel ID never wipes leftover legacy tax data", async () => {
    const legacy = 'TAX:{"defaultTaxRate":9}';
    const { db, writes } = fakeDb({ id: "s1", storeEnabled: true, facebookPixelId: legacy });
    const res = await updateSettings(db, { storeName: "Shop", facebookPixelId: null }, actor);
    expect(res.ok).toBe(true);
    expect(writes[0]).toEqual({ storeName: "Shop" });
    // ...and the response still hides it.
    if (res.ok) expect((res.data as Record<string, unknown>).facebookPixelId).toBeNull();
  });
});

describe("StoreAnalytics (storefront loader)", () => {
  it("renders nothing when no IDs are set", async () => {
    row.current = { googleAnalyticsId: null, facebookPixelId: null };
    expect(await StoreAnalytics({ tenantId: "t1" })).toBeNull();
  });
  it("renders nothing for invalid or legacy TAX values", async () => {
    row.current = { googleAnalyticsId: "UA-123-1", facebookPixelId: 'TAX:{"defaultTaxRate":9}' };
    expect(await StoreAnalytics({ tenantId: "t1" })).toBeNull();
  });
  it("passes only valid IDs to the client loader", async () => {
    row.current = { googleAnalyticsId: "G-AB12CD34EF", facebookPixelId: "bad" };
    const el = (await StoreAnalytics({})) as { props: Record<string, unknown> } | null;
    expect(el?.props).toEqual({ gaId: "G-AB12CD34EF", pixelId: null });
  });
});

describe("settings service: pre-existing values", () => {
  it("an unchanged malformed ID does not block saving other fields", async () => {
    const { db, writes } = fakeDb({ id: "s1", storeEnabled: true, facebookPixelId: "1234567890", googleAnalyticsId: "UA-1-1" });
    const res = await updateSettings(db, { storeName: "New", facebookPixelId: "1234567890", googleAnalyticsId: "UA-1-1" }, { role: "ADMIN" });
    expect(res.ok).toBe(true);
    expect(writes[0]).toEqual({ storeName: "New" });
  });
});
