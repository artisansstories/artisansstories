/**
 * email-branding.ts — Per-tenant transactional email branding (E1)
 *
 * Resolves the sender identity + visual brand (name, logo, accent color, store
 * URL, reply-to) for a tenant's outgoing transactional emails. Every email-
 * sending route resolves a tenantId, then calls `getEmailBranding(tenantId)` and
 * threads the result into both the `from`/`replyTo` envelope and the email
 * template body — so no template hardcodes "Artisans' Stories" anymore.
 *
 * Tenant zero (DEFAULT_TENANT_ID) returns fixed Artisans Stories values. Other
 * tenants are resolved from `Tenant` + `TenantTheme`, with the email-specific
 * `TenantTheme.email*` fields overriding the store-level fallbacks.
 *
 * Results are cached 60s per tenantId — emails are high-volume and we don't want
 * a DB round-trip on every send.
 */
import { prisma } from "./prisma";
import { DEFAULT_TENANT_ID } from "./tenant-context";
import { tenantBaseUrl } from "./tenant-host";

/** The Artisans Stories logo served from R2, used as the house email logo. */
const AS_LOGO_URL =
  "https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/artisansstories-logo.png";
const AS_STORE_NAME = "Artisans' Stories";
const AS_FROM_ADDRESS = "hello@artisansstories.com";
const AS_ACCENT = "#8B6914";
const AS_STORE_URL = "https://artisansstories.com";

export interface EmailBranding {
  fromName: string; // e.g. "Galarraga Baseball Academy" — shown as sender name
  fromAddress: string; // always hello@artisansstories.com for now
  from: string; // full "Name <email>" string
  replyTo?: string;
  logoUrl: string; // "" = no logo, templates fall back to text storeName
  storeName: string;
  accentColor: string; // for CTA buttons
  storeUrl: string; // e.g. https://galarraga-baseball.artisansstories.com
}

/** Fixed branding for tenant zero (Artisans Stories). */
function houseBranding(): EmailBranding {
  return {
    fromName: AS_STORE_NAME,
    fromAddress: AS_FROM_ADDRESS,
    from: `${AS_STORE_NAME} <${AS_FROM_ADDRESS}>`,
    replyTo: undefined,
    logoUrl: AS_LOGO_URL,
    storeName: AS_STORE_NAME,
    accentColor: AS_ACCENT,
    storeUrl: AS_STORE_URL,
  };
}

// ── 60s per-tenant cache ─────────────────────────────────────────────────────
// Mirrors the lightweight Map+timestamp cache used elsewhere (tenant-host.ts).
// A stale/missing entry only costs one extra DB lookup, never correctness.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { value: EmailBranding; expiresAt: number }>();

/** Test-only: drop all cached branding entries. */
export function _clearEmailBrandingCache(): void {
  cache.clear();
}

/**
 * Resolve the transactional email branding for a tenant. Tenant zero returns the
 * fixed Artisans Stories identity; every other tenant resolves from its Tenant +
 * TenantTheme rows. Falls back to house values if the tenant can't be found.
 */
export async function getEmailBranding(tenantId: string): Promise<EmailBranding> {
  if (tenantId === DEFAULT_TENANT_ID) return houseBranding();

  const cached = cache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  // Tenant + TenantTheme are platform/global models (not auto-scoped), so read
  // them through the raw client by id.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, name: true, theme: true },
  });

  // Unknown tenant — fail safe to house branding rather than send a broken email.
  if (!tenant) return houseBranding();

  const theme = tenant.theme;
  const fromName = theme?.emailFromName ?? tenant.name;
  const replyTo = theme?.emailReplyTo ?? undefined;
  const logoUrl = theme?.emailLogoUrl ?? theme?.logoUrl ?? "";
  const accentColor = theme?.emailAccentColor ?? theme?.accentColor ?? AS_ACCENT;

  const value: EmailBranding = {
    fromName,
    fromAddress: AS_FROM_ADDRESS,
    from: `${fromName} <${AS_FROM_ADDRESS}>`,
    replyTo,
    logoUrl,
    storeName: tenant.name,
    accentColor,
    storeUrl: tenantBaseUrl(tenant.slug),
  };

  cache.set(tenantId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Render the email header logo: the tenant's logo `<img>`, or — when no logo is
 * configured — the store name as styled text so the email never shows a broken
 * image. Shared by every transactional template's logo header.
 */
export function emailLogoHtml(branding: EmailBranding, width = 400): string {
  if (branding.logoUrl) {
    return `<img src="${branding.logoUrl}" alt="${branding.storeName}" width="${width}" style="display:block;margin:0 auto;width:${width}px;max-width:90%;height:auto;" />`;
  }
  return `<span style="display:inline-block;font-family:'Helvetica Neue',Arial,sans-serif;font-size:26px;font-weight:700;color:#3a2e24;letter-spacing:0.02em;">${branding.storeName}</span>`;
}
