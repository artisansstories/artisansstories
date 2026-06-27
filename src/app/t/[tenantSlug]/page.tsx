/**
 * /t/[tenantSlug]/page.tsx — Branded storefront home (P5)
 *
 * Server component. Resolves the tenant (cached from the layout) and fetches
 * its ACTIVE products through the tenant-SCOPED Prisma client, so cross-tenant
 * leakage is impossible at the query layer. Renders a hero, a featured row and
 * a full product grid — every accent driven by `--brand-*` CSS vars.
 */
import { notFound } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { getStorefrontTenant } from "@/lib/storefront";
import BrandProductCard, { type BrandProduct } from "./_components/BrandProductCard";

const GRID_SELECT = {
  slug: true,
  name: true,
  price: true,
  compareAtPrice: true,
  isFeatured: true,
  images: {
    orderBy: { position: "asc" as const },
    take: 1,
    select: { url: true, urlMedium: true, altText: true },
  },
} as const;

export default async function StorefrontHome({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getStorefrontTenant(tenantSlug);
  if (!tenant) notFound();

  const db = getTenantPrisma(tenant.id);
  const products: BrandProduct[] = await db.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ isFeatured: "desc" }, { totalSold: "desc" }, { createdAt: "desc" }],
    take: 48,
    select: GRID_SELECT,
  });

  const featured = products.filter((p) => p.isFeatured).slice(0, 4);
  const featuredSlugs = new Set(featured.map((p) => p.slug));
  const rest = products.filter((p) => !featuredSlugs.has(p.slug));
  // If nothing is flagged featured, fall back to the first few products so the
  // featured strip still renders meaningfully for any tenant.
  const featuredRow = featured.length > 0 ? featured : products.slice(0, 4);
  const gridProducts = featured.length > 0 ? rest : products;

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section
        style={{
          background:
            "linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)",
          color: "var(--brand-on-primary)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <span
              className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-widest"
              style={{
                borderRadius: "var(--brand-radius)",
                background: "var(--brand-accent)",
                color: "var(--brand-on-accent)",
              }}
            >
              New Collection
            </span>
            <h1
              className="mt-5 text-4xl font-bold leading-[1.1] sm:text-6xl"
              style={{ fontFamily: "var(--brand-font-heading)" }}
            >
              {tenant.name}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed opacity-90 sm:text-lg">
              Thoughtfully made pieces, crafted to last. Discover the collection and
              find something you&apos;ll love.
            </p>
            <a
              href="#catalog"
              className="mt-8 inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{
                borderRadius: "var(--brand-radius)",
                background: "var(--brand-on-primary)",
                color: "var(--brand-primary)",
              }}
            >
              Shop the collection
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Featured strip ─────────────────────────────────────────────────── */}
      {featuredRow.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2
                className="text-2xl font-bold text-stone-900 sm:text-3xl"
                style={{ fontFamily: "var(--brand-font-heading)" }}
              >
                Featured
              </h2>
              <p className="mt-1 text-sm text-stone-500">Hand-picked favorites from {tenant.name}.</p>
            </div>
            <span
              aria-hidden
              className="hidden h-1 w-16 sm:block"
              style={{ background: "var(--brand-accent)", borderRadius: 999 }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
            {featuredRow.map((p) => (
              <BrandProductCard key={p.slug} product={p} tenantSlug={tenant.slug} />
            ))}
          </div>
        </section>
      )}

      {/* ── Full catalog grid ──────────────────────────────────────────────── */}
      <section id="catalog" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-6">
          <h2
            className="text-2xl font-bold text-stone-900 sm:text-3xl"
            style={{ fontFamily: "var(--brand-font-heading)" }}
          >
            Shop all
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {products.length} {products.length === 1 ? "product" : "products"} available
          </p>
        </div>

        {gridProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {gridProducts.map((p) => (
              <BrandProductCard key={p.slug} product={p} tenantSlug={tenant.slug} />
            ))}
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-20 text-center"
            style={{ borderRadius: "var(--brand-radius)", background: "#f5f3ef" }}
          >
            <p className="text-lg font-semibold text-stone-700" style={{ fontFamily: "var(--brand-font-heading)" }}>
              Coming soon
            </p>
            <p className="mt-1 text-sm text-stone-500">New products are on their way.</p>
          </div>
        )}
      </section>
    </>
  );
}
