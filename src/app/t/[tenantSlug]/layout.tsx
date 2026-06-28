/**
 * /t/[tenantSlug]/layout.tsx — White-label storefront shell (P5)
 *
 * Resolves the tenant by slug, loads its theme, and injects the brand as CSS
 * custom properties onto a scoping wrapper. Every descendant (this page, the
 * product grid, the product detail page) reads `--brand-primary`,
 * `--brand-accent`, `--brand-radius`, `--brand-font-*` etc. — so the exact same
 * code renders any tenant in their own brand. Nothing here is Artisans-specific.
 *
 * This is a NESTED layout: the root layout owns <html>/<body>, so we scope the
 * brand to a wrapper <div> rather than :root. CSS custom properties set via
 * inline style cascade to the whole subtree, which is precisely the isolation
 * we want — one brand per request, no global leakage.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefrontTenant } from "@/lib/storefront";
import { themeToCssVars } from "@/lib/theme";
import { BRAND_FONT_VARS, fontStack } from "./brand-fonts";
import { CartProvider } from "./_components/CartContext";
import CartIcon from "./_components/CartIcon";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await getStorefrontTenant(tenantSlug);
  if (!tenant) return { title: "Store not found" };
  // The favicon pipeline (U2) emits a 256×256 PNG for raster sources, or passes
  // an SVG through raw. Declare a typed icon plus an apple-touch-icon so iOS
  // home-screen bookmarks / PWAs pick up the brand — not just the browser tab.
  const faviconUrl = tenant.theme.faviconUrl;
  const isSvgFavicon = faviconUrl
    ? faviconUrl.toLowerCase().split("?")[0].endsWith(".svg")
    : false;
  return {
    title: `${tenant.name} — Shop`,
    description: `Shop handcrafted goods from ${tenant.name}.`,
    icons: faviconUrl
      ? {
          icon: isSvgFavicon
            ? [{ url: faviconUrl, type: "image/svg+xml" }]
            : [{ url: faviconUrl, type: "image/png", sizes: "256x256" }],
          // apple-touch-icon must be raster; only emit it for the PNG output.
          ...(isSvgFavicon ? {} : { apple: [{ url: faviconUrl, sizes: "256x256" }] }),
        }
      : undefined,
  };
}

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getStorefrontTenant(tenantSlug);
  if (!tenant) notFound();
  // Per-tenant go-live gate: an unpublished store is not publicly visible. The
  // `POST .../go-live` operator endpoint flips this same flag (additive, tenant-
  // scoped; the Artisans singleton `/shop` gating in proxy.ts is untouched).
  if (!tenant.storeEnabled) notFound();

  const { theme } = tenant;

  // Brand CSS variables: colors + radius from the theme, font stacks resolved
  // against the loaded next/font variables.
  const brandVars: Record<string, string> = {
    ...themeToCssVars(theme),
    "--brand-font-heading": fontStack(theme.fontHeading),
    "--brand-font-body": fontStack(theme.fontBody),
  };

  // Root-relative "/" — the proxy rewrites subdomain requests so /t/{slug}
  // is served at / on the tenant subdomain. Using /t/... would 404.
  const homeHref = "/";

  return (
    <CartProvider tenantSlug={tenant.slug}>
    <div
      className={`brand-scope ${BRAND_FONT_VARS}`}
      style={{
        ...(brandVars as React.CSSProperties),
        fontFamily: "var(--brand-font-body)",
        background: "#fbfbfa",
        color: "#1c1917",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Scoped typographic + interaction defaults driven by the brand vars. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .brand-scope h1, .brand-scope h2, .brand-scope h3 { font-family: var(--brand-font-heading); }
            .brand-scope ::selection { background: var(--brand-accent); color: var(--brand-on-accent); }
            .brand-scope a { color: inherit; text-decoration: none; }
            .brand-scope .brand-link:hover { color: var(--brand-primary); }
          `,
        }}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "saturate(180%) blur(12px)",
          borderBottom: "1px solid #ece9e4",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href={homeHref} className="flex items-center gap-3">
            {theme.logoUrl ? (
              /* Fixed-height box reserves vertical space so the sticky header
                 doesn't reflow when the logo loads (avoids CLS). The intrinsic
                 height attr hints the browser; max-width caps very wide logos. */
              <span style={{ display: "inline-flex", alignItems: "center", height: 40, maxWidth: 220 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={theme.logoUrl}
                  alt={tenant.name}
                  height={40}
                  style={{ height: 40, width: "auto", maxWidth: 220, objectFit: "contain", display: "block" }}
                />
              </span>
            ) : (
              <span
                style={{
                  fontFamily: "var(--brand-font-heading)",
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  color: "var(--brand-primary)",
                }}
              >
                {tenant.name}
              </span>
            )}
          </Link>

          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href={homeHref} className="brand-link hidden sm:inline">
              Shop
            </Link>
            <CartIcon />
          </nav>
        </div>
      </header>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <main style={{ flex: 1 }}>{children}</main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid #ece9e4", background: "#fff" }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-stone-500 sm:flex-row sm:px-6">
          <span style={{ fontFamily: "var(--brand-font-heading)", fontWeight: 600, color: "#44403c" }}>
            {tenant.name}
          </span>
          <span className="text-xs text-stone-400">
            © {tenant.name} · Powered by{" "}
            <span style={{ fontWeight: 600, color: "#78716c" }}>Orange Slice Stores</span>
          </span>
        </div>
      </footer>
    </div>
    </CartProvider>
  );
}
