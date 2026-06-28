/**
 * storefront.ts — Shared data access for the white-label `/t/[slug]` storefront.
 *
 * Tenant resolution by slug is a platform-global lookup (Tenant is NOT a
 * tenant-scoped model), so it uses the raw `prisma` client. `getStorefrontTenant`
 * is wrapped in React `cache` so the layout and the page can each call it within
 * a single request without a second DB round-trip — layouts cannot pass data to
 * their child pages, so deduping here is how they share the resolved tenant.
 *
 * Suspended / missing tenants resolve to null; callers `notFound()` on null.
 */
import { cache } from "react";
import { prisma } from "./prisma";
import { resolveTheme, type ThemeValue } from "./theme";

export interface StorefrontTenant {
  id: string;
  slug: string;
  name: string;
  theme: ThemeValue;
  /** Per-tenant go-live flag (StoreSettings.storeEnabled). False until published. */
  storeEnabled: boolean;
}

/**
 * Resolve a live (non-suspended) tenant by slug, with its theme already merged
 * over platform defaults. Also reports the tenant's own `storeEnabled` flag so
 * the storefront can 404 a store that has not been taken live (the go-live gate;
 * StoreSettings has no relation back to Tenant, so it's a second scoped lookup).
 * Memoized per-request via React `cache`.
 */
export const getStorefrontTenant = cache(
  async (slug: string): Promise<StorefrontTenant | null> => {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      include: { theme: true },
    });
    if (!tenant || tenant.status === "SUSPENDED" || tenant.status === "ARCHIVED") return null;
    const settings = await prisma.storeSettings.findUnique({
      where: { tenantId: tenant.id },
      select: { storeEnabled: true },
    });
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      theme: resolveTheme(tenant.theme ?? undefined),
      storeEnabled: settings?.storeEnabled ?? false,
    };
  },
);

/** Minimal money formatter (cents → "$12.34"); kept local to avoid pulling in
 *  the client-only cart store. */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
