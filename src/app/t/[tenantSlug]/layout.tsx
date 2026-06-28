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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await getStorefrontTenant(tenantSlug);
  if (!tenant) return { title: "Store not found" };
  return {
    title: `${tenant.name} — Shop`,
    description: `Shop handcrafted goods from ${tenant.name}.`,
    icons: tenant.theme.faviconUrl ? { icon: tenant.theme.faviconUrl } : undefined,
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

  const homeHref = `/t/${tenant.slug}`;

  return (
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
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={theme.logoUrl}
                alt={tenant.name}
                style={{ height: 40, width: "auto", objectFit: "contain", display: "block" }}
              />
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
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 38,
                width: 38,
                borderRadius: "var(--brand-radius)",
                background: "var(--brand-primary)",
                color: "var(--brand-on-primary)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </svg>
            </span>
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
            <span style={{ fontWeight: 600, color: "#78716c" }}>Simplify</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
