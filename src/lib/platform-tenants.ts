/**
 * platform-tenants.ts — shared validation for the platform onboarding surface (P6)
 */

/** Scopes an API key may be granted. Anything else → 400 at mint time. */
export const ALLOWED_SCOPES = ["store:read", "store:write", "checkout:create"] as const;
export type ApiScope = (typeof ALLOWED_SCOPES)[number];

/** Default scopes for a freshly minted key when the caller omits `scopes`. */
export const DEFAULT_SCOPES: ApiScope[] = ["store:read", "checkout:create"];

/** Valid storefront checkout modes (mirrors Tenant.checkoutMode). */
export const CHECKOUT_MODES = ["embedded", "connect_redirect"] as const;
export type CheckoutMode = (typeof CHECKOUT_MODES)[number];

/** Tenant lifecycle states (mirrors the TenantStatus enum). */
export const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "PENDING", "ARCHIVED"] as const;
export type TenantStatusValue = (typeof TENANT_STATUSES)[number];

/**
 * A slug must be lowercase, url-safe and hyphen-delimited: alphanumeric segments
 * joined by single hyphens, no leading/trailing/double hyphens.
 *   ok: "mikes-pottery", "shop1"   bad: "Mike", "a_b", "-x", "x-", "a--b"
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length >= 2 && slug.length <= 63 && SLUG_RE.test(slug);
}

/** Validate a scopes array against the allowlist. Returns the unknown scopes. */
export function unknownScopes(scopes: string[]): string[] {
  return scopes.filter((s) => !ALLOWED_SCOPES.includes(s as ApiScope));
}
