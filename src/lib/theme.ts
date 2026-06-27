/**
 * theme.ts — Tenant theming guardrails (P5)
 *
 * The platform lets each tenant brand their storefront, but branding is a
 * blunt instrument: an unconstrained "pick any color / any font" UI lets a
 * tenant ship an unreadable, off-brand monstrosity that reflects badly on the
 * whole platform. So every theme value flows through `validateThemeInput`,
 * which enforces:
 *
 *   - colors   → strict `#rgb` / `#rrggbb` hex only
 *   - fonts    → a curated allowlist of fonts the app actually loads
 *   - radius   → one of a small set of design tokens (mapped to px later)
 *   - logo/fav → http(s) URL or an R2/relative asset path, nothing else
 *   - unknown keys → rejected outright
 *
 * `themeToCssVars` turns a validated theme into the `--brand-*` CSS custom
 * properties the storefront subtree reads. Color → font-family mapping lives in
 * the storefront's font module (it depends on next/font); this file stays
 * framework-free so it can be imported anywhere (routes, scripts, tests).
 */

/** Fonts the app is willing to render. Anything else is rejected. */
export const FONT_ALLOWLIST = [
  "Inter",
  "Cormorant Garamond",
  "Anonymous Pro",
  "Happy Monkey",
  "Oregano",
  "Poppins",
  "Playfair Display",
] as const;

/** Corner-radius design tokens. Mapped to px by `radiusToken`. */
export const RADIUS_ALLOWLIST = ["none", "sm", "md", "lg"] as const;

export type FontName = (typeof FONT_ALLOWLIST)[number];
export type RadiusToken = (typeof RADIUS_ALLOWLIST)[number];

/** A fully-resolved, validated theme — every field present and safe to render. */
export interface ThemeValue {
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  radius: string;
}

/**
 * Platform default theme. Matches the schema `@default(...)` values on
 * TenantTheme so a tenant with no theme row renders identically to one whose
 * row holds only defaults.
 */
export const DEFAULT_THEME: ThemeValue = {
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#1f6feb",
  secondaryColor: "#0b3d91",
  accentColor: "#ff7a18",
  fontHeading: "Inter",
  fontBody: "Inter",
  radius: "md",
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Strict hex color: `#rgb` or `#rrggbb` only (no alpha, no named colors). */
export function isValidHex(s: unknown): s is string {
  return typeof s === "string" && HEX_RE.test(s.trim());
}

/**
 * Acceptable logo / favicon source: an absolute http(s) URL, an explicit
 * `r2://` reference, or a root-relative asset path (e.g. an R2 public path
 * proxied under our own origin). Everything else (data:, javascript:, bare
 * strings) is rejected.
 */
export function isValidAssetUrl(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const v = s.trim();
  if (!v) return false;
  if (/^https?:\/\/.+/i.test(v)) return true;
  if (/^r2:\/\/.+/i.test(v)) return true;
  if (v.startsWith("/")) return true;
  return false;
}

/** Radius token → px string. */
export function radiusToken(radius: string): string {
  switch (radius) {
    case "none":
      return "0px";
    case "sm":
      return "4px";
    case "lg":
      return "16px";
    case "md":
    default:
      return "8px";
  }
}

/**
 * Pick a readable foreground (near-black or white) for text/icons placed on a
 * given brand color, using the WCAG relative-luminance formula. Keeps primary
 * buttons legible whether the brand color is bright yellow or deep navy.
 */
export function readableText(hex: string): string {
  const v = hex.trim().replace("#", "");
  const full =
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v;
  if (full.length !== 6) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#111111" : "#ffffff";
}

const ALLOWED_KEYS = new Set<keyof ThemeValue>([
  "logoUrl",
  "faviconUrl",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "fontHeading",
  "fontBody",
  "radius",
]);

const COLOR_KEYS = ["primaryColor", "secondaryColor", "accentColor"] as const;
const FONT_KEYS = ["fontHeading", "fontBody"] as const;

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  /** Fully-resolved theme (input merged over DEFAULT_THEME). Only safe when ok. */
  value: ThemeValue;
}

/**
 * The guardrail. Validates and coerces arbitrary input into a full ThemeValue.
 * Unknown keys, bad hex, off-allowlist fonts, bad radius tokens and malformed
 * asset URLs all produce an error and `ok:false`. Missing keys fall back to
 * DEFAULT_THEME so the result is always a complete, renderable theme.
 */
export function validateThemeInput(input: unknown): ValidateResult {
  const errors: string[] = [];

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Body must be a JSON object."],
      value: { ...DEFAULT_THEME },
    };
  }

  const raw = input as Record<string, unknown>;
  const value: ThemeValue = { ...DEFAULT_THEME };

  // Reject unknown keys — this keeps the theme surface area locked down.
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key as keyof ThemeValue)) {
      errors.push(`Unknown field: "${key}".`);
    }
  }

  // Colors — strict hex.
  for (const key of COLOR_KEYS) {
    if (raw[key] === undefined || raw[key] === null) continue;
    if (isValidHex(raw[key])) {
      value[key] = (raw[key] as string).trim().toLowerCase();
    } else {
      errors.push(`${key} must be a hex color like "#1f6feb" (got ${JSON.stringify(raw[key])}).`);
    }
  }

  // Fonts — allowlist only.
  for (const key of FONT_KEYS) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const v = raw[key];
    if (typeof v === "string" && (FONT_ALLOWLIST as readonly string[]).includes(v)) {
      value[key] = v;
    } else {
      errors.push(
        `${key} must be one of: ${FONT_ALLOWLIST.join(", ")} (got ${JSON.stringify(v)}).`,
      );
    }
  }

  // Radius — token allowlist.
  if (raw.radius !== undefined && raw.radius !== null) {
    const v = raw.radius;
    if (typeof v === "string" && (RADIUS_ALLOWLIST as readonly string[]).includes(v)) {
      value.radius = v;
    } else {
      errors.push(`radius must be one of: ${RADIUS_ALLOWLIST.join(", ")} (got ${JSON.stringify(v)}).`);
    }
  }

  // Asset URLs — optional; null clears, string must be a valid asset reference.
  for (const key of ["logoUrl", "faviconUrl"] as const) {
    if (raw[key] === undefined) continue;
    if (raw[key] === null || raw[key] === "") {
      value[key] = null;
    } else if (isValidAssetUrl(raw[key])) {
      value[key] = (raw[key] as string).trim();
    } else {
      errors.push(`${key} must be an http(s) URL or an asset path (got ${JSON.stringify(raw[key])}).`);
    }
  }

  return { ok: errors.length === 0, errors, value };
}

/**
 * Resolve a (possibly null) DB theme row into a full, renderable ThemeValue.
 * Missing fields fall back to DEFAULT_THEME. Does NOT validate — DB rows are
 * trusted because they were validated on write.
 */
export function resolveTheme(row: Partial<ThemeValue> | null | undefined): ThemeValue {
  if (!row) return { ...DEFAULT_THEME };
  return {
    logoUrl: row.logoUrl ?? DEFAULT_THEME.logoUrl,
    faviconUrl: row.faviconUrl ?? DEFAULT_THEME.faviconUrl,
    primaryColor: row.primaryColor ?? DEFAULT_THEME.primaryColor,
    secondaryColor: row.secondaryColor ?? DEFAULT_THEME.secondaryColor,
    accentColor: row.accentColor ?? DEFAULT_THEME.accentColor,
    fontHeading: row.fontHeading ?? DEFAULT_THEME.fontHeading,
    fontBody: row.fontBody ?? DEFAULT_THEME.fontBody,
    radius: row.radius ?? DEFAULT_THEME.radius,
  };
}

/**
 * Map a theme to the `--brand-*` CSS custom properties consumed by the
 * storefront. Font-family vars are added by the storefront layout (they map to
 * next/font variables); this returns the framework-free color + radius vars
 * plus computed readable-text colors for primary/accent surfaces.
 */
export function themeToCssVars(theme: ThemeValue): Record<string, string> {
  return {
    "--brand-primary": theme.primaryColor,
    "--brand-secondary": theme.secondaryColor,
    "--brand-accent": theme.accentColor,
    "--brand-radius": radiusToken(theme.radius),
    "--brand-on-primary": readableText(theme.primaryColor),
    "--brand-on-accent": readableText(theme.accentColor),
    "--brand-on-secondary": readableText(theme.secondaryColor),
  };
}
