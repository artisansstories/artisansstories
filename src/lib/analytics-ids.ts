/**
 * analytics-ids.ts — format rules for the per-store tracking IDs
 * (StoreSettings.googleAnalyticsId / facebookPixelId). Pure and dependency-free:
 * shared by the settings service (validation on save), the storefront loader
 * (only valid IDs ever reach the page), and the admin Settings status line.
 *
 * facebookPixelId may still hold legacy "TAX:{json}" data (see
 * admin-services/tax.ts); that is treated as "not set" everywhere here.
 */

export const GA_ID_RE = /^G-[A-Z0-9]{4,}$/;
export const PIXEL_ID_RE = /^\d{15,16}$/;

const LEGACY_TAX_PREFIX = "TAX:";

/** Trimmed, upper-cased GA4 Measurement ID, or null when blank. */
export function normalizeGaId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return v ? v : null;
}

/** Pixel ID with spaces removed, or null when blank or legacy tax data. */
export function normalizePixelId(value: unknown): string | null {
  if (typeof value !== "string" || value.startsWith(LEGACY_TAX_PREFIX)) return null;
  const v = value.replace(/\s+/g, "");
  return v ? v : null;
}

/** The GA4 ID to load on the storefront, or null. */
export function validGaId(value: unknown): string | null {
  const v = normalizeGaId(value);
  return v && GA_ID_RE.test(v) ? v : null;
}

/** The Meta Pixel ID to load on the storefront, or null. */
export function validPixelId(value: unknown): string | null {
  const v = normalizePixelId(value);
  return v && PIXEL_ID_RE.test(v) ? v : null;
}

export type TrackingStatus = "active" | "not_set" | "invalid";

export function gaStatus(value: unknown): TrackingStatus {
  if (!normalizeGaId(value)) return "not_set";
  return validGaId(value) ? "active" : "invalid";
}

export function pixelStatus(value: unknown): TrackingStatus {
  if (!normalizePixelId(value)) return "not_set";
  return validPixelId(value) ? "active" : "invalid";
}

export const GA_ID_ERROR =
  "That doesn't look like a GA4 Measurement ID. Paste the ID that starts with G- (e.g. G-AB12CD34EF) from Google Analytics → Admin → Data streams. Leave it blank to turn Google Analytics off.";
export const PIXEL_ID_ERROR =
  "That doesn't look like a Meta Pixel ID. Paste the 15–16 digit number from Meta Events Manager → Data sources. Leave it blank to turn the Pixel off.";

/**
 * Normalize the tracking IDs in a settings update in place and return a
 * friendly error if either is malformed. Fields absent from `data` are left
 * alone; blank values become null (tracking off).
 */
export function validateTrackingIds(data: Record<string, unknown>): string | null {
  if ("googleAnalyticsId" in data && data.googleAnalyticsId != null) {
    const v = normalizeGaId(data.googleAnalyticsId);
    if (typeof data.googleAnalyticsId !== "string" || (v && !GA_ID_RE.test(v))) return GA_ID_ERROR;
    data.googleAnalyticsId = v;
  }
  if ("facebookPixelId" in data && data.facebookPixelId != null) {
    if (typeof data.facebookPixelId !== "string" || data.facebookPixelId.startsWith(LEGACY_TAX_PREFIX)) return PIXEL_ID_ERROR;
    const v = normalizePixelId(data.facebookPixelId);
    if (v && !PIXEL_ID_RE.test(v)) return PIXEL_ID_ERROR;
    data.facebookPixelId = v;
  }
  return null;
}
