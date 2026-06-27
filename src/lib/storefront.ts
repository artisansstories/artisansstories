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
}

/**
 * Resolve a live (non-suspended) tenant by slug, with its theme already merged
 * over platform defaults. Memoized per-request via React `cache`.
 */
export const getStorefrontTenant = cache(
  async (slug: string): Promise<StorefrontTenant | null> => {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      include: { theme: true },
    });
    if (!tenant || tenant.status === "SUSPENDED") return null;
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      theme: resolveTheme(tenant.theme ?? undefined),
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
