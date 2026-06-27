/**
 * BrandProductCard — presentational product card for the white-label storefront.
 *
 * Server component. Every accent is driven by `--brand-*` CSS vars set by the
 * storefront layout, so it renders in any tenant's brand with zero hardcoded
 * colors. Links to the branded product detail page at /t/[slug]/[productSlug].
 */
import Link from "next/link";
import { formatPrice } from "@/lib/storefront";

export interface BrandProduct {
  slug: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  isFeatured?: boolean;
  images: { url: string; urlMedium?: string | null; altText?: string | null }[];
}

export default function BrandProductCard({
  product,
  tenantSlug,
}: {
  product: BrandProduct;
  tenantSlug: string;
}) {
  const image = product.images[0];
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;
  const pct = onSale
    ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
    : 0;

  return (
    <Link
      href={`/t/${tenantSlug}/${product.slug}`}
      className="group block"
      style={{ borderRadius: "var(--brand-radius)" }}
    >
      <article
        className="flex h-full flex-col overflow-hidden bg-white transition-shadow duration-200 hover:shadow-xl"
        style={{
          borderRadius: "var(--brand-radius)",
          border: "1px solid #ece9e4",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Image */}
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: "1 / 1", background: "#f5f3ef" }}>
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image.urlMedium ?? image.url}
              alt={image.altText ?? product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-stone-300">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </div>
          )}

          {/* Sale badge — uses brand accent */}
          {onSale && (
            <span
              className="absolute left-3 top-3 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={{
                borderRadius: "var(--brand-radius)",
                background: "var(--brand-accent)",
                color: "var(--brand-on-accent)",
              }}
            >
              −{pct}%
            </span>
          )}

          {/* Featured pill */}
          {product.isFeatured && !onSale && (
            <span
              className="absolute left-3 top-3 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                borderRadius: "var(--brand-radius)",
                background: "rgba(255,255,255,0.92)",
                color: "var(--brand-primary)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              }}
            >
              Featured
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col p-4">
          <h3
            className="mb-2 line-clamp-2 text-[15px] font-semibold leading-snug text-stone-800"
            style={{ fontFamily: "var(--brand-font-heading)" }}
          >
            {product.name}
          </h3>

          <div className="mt-auto flex items-baseline gap-2">
            <span className="text-base font-bold" style={{ color: "var(--brand-primary)" }}>
              {formatPrice(product.price)}
            </span>
            {onSale && (
              <span className="text-sm text-stone-400 line-through">
                {formatPrice(product.compareAtPrice!)}
              </span>
            )}
          </div>

          <span
            className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-opacity group-hover:opacity-90"
            style={{
              borderRadius: "var(--brand-radius)",
              background: "var(--brand-primary)",
              color: "var(--brand-on-primary)",
            }}
          >
            View Product
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </span>
        </div>
      </article>
    </Link>
  );
}
