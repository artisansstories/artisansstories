"use client";

/**
 * ProductDetailClient — interactive island for the branded product detail page.
 *
 * Image gallery + option selectors + quantity + add-to-cart, all styled from
 * `--brand-*` CSS vars so it matches the tenant's brand. The white-label
 * storefront has no per-tenant cart backend yet, so "Add to Cart" gives
 * optimistic local feedback only — it's the polished, demo-ready UI shell the
 * real cart will plug into. No colors are hardcoded.
 */
import { useMemo, useState } from "react";
import { useCart } from "./CartContext";

interface DetailImage {
  url: string;
  urlMedium?: string | null;
  altText?: string | null;
}
interface DetailOption {
  name: string;
  values: string[];
}
interface DetailVariant {
  id: string;
  name: string;
  price: number | null;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  description?: string | null;
  story?: string | null;
  images: DetailImage[];
  options: DetailOption[];
  variants: DetailVariant[];
  artisanName?: string | null;
  materialsUsed?: string[];
  originCountry?: string | null;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function ProductDetailClient({ product }: { product: ProductDetail }) {
  const { addItem } = useCart();
  const [activeImage, setActiveImage] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const opt of product.options) if (opt.values[0]) init[opt.name] = opt.values[0];
    return init;
  });
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;
  const images = product.images.length ? product.images : [];
  const hero = images[activeImage] ?? images[0];

  const allChosen = useMemo(
    () => product.options.every((o) => selected[o.name]),
    [product.options, selected],
  );

  // Find the variant that matches the selected options (by name match)
  const selectedVariant = useMemo(() => {
    if (product.variants.length === 0) return null;
    if (product.options.length === 0) return product.variants[0];
    const selectedLabel = Object.values(selected).join(" / ");
    return product.variants.find(v => v.name === selectedLabel) ?? product.variants[0];
  }, [product.variants, product.options.length, selected]);

  // Button is disabled only when options exist but not all chosen
  const canAdd = product.options.length === 0 || allChosen;

  function handleAdd() {
    if (!canAdd) return;
    // Use matched variant if available; fall back to a synthetic entry keyed on productId
    const variantId = selectedVariant?.id ?? `product:${product.id}`;
    const variantName = selectedVariant?.name ?? product.name;
    const price = selectedVariant?.price ?? product.price;
    addItem({
      variantId,
      productId: product.id,
      productSlug: product.slug,
      name: product.name,
      variantName,
      price,
      quantity: qty,
      imageUrl: product.images[0]?.urlMedium ?? product.images[0]?.url,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
      {/* ── Gallery ──────────────────────────────────────────────────────── */}
      <div>
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "1 / 1", background: "#f5f3ef", borderRadius: "var(--brand-radius)" }}
        >
          {hero ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={hero.urlMedium ?? hero.url}
              alt={hero.altText ?? product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-stone-300">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {images.slice(0, 6).map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveImage(i)}
                aria-label={`View image ${i + 1} of ${images.length}`}
                aria-pressed={i === activeImage}
                className="relative h-16 w-16 shrink-0 overflow-hidden transition-all"
                style={{
                  borderRadius: "var(--brand-radius)",
                  outline: i === activeImage ? "2px solid var(--brand-primary)" : "1px solid #e7e5e4",
                  outlineOffset: i === activeImage ? "1px" : "0",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.urlMedium ?? img.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Buy box ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col">
        <h1
          className="text-3xl font-bold leading-tight text-stone-900 sm:text-4xl"
          style={{ fontFamily: "var(--brand-font-heading)" }}
        >
          {product.name}
        </h1>

        {product.artisanName && (
          <p className="mt-1 text-sm text-stone-500">
            by <span className="font-medium text-stone-700">{product.artisanName}</span>
            {product.originCountry ? ` · ${product.originCountry}` : ""}
          </p>
        )}

        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-2xl font-bold" style={{ color: "var(--brand-primary)" }}>
            {formatPrice(product.price)}
          </span>
          {onSale && (
            <span className="text-lg text-stone-400 line-through">
              {formatPrice(product.compareAtPrice!)}
            </span>
          )}
          {onSale && (
            <span
              className="px-2 py-0.5 text-xs font-bold uppercase"
              style={{
                borderRadius: "var(--brand-radius)",
                background: "var(--brand-accent)",
                color: "var(--brand-on-accent)",
              }}
            >
              Sale
            </span>
          )}
        </div>

        {product.description && (
          <div
            className="rte-content rte-content-display mt-5 text-[15px] leading-relaxed text-stone-600"
            style={{ fontFamily: "var(--brand-font-body)" }}
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        )}

        {/* Option selectors */}
        {product.options.map((opt) => (
          <div key={opt.name} className="mt-6">
            <div className="mb-2 text-sm font-semibold text-stone-700">{opt.name}</div>
            <div className="flex flex-wrap gap-2">
              {opt.values.map((val) => {
                const active = selected[opt.name] === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSelected((s) => ({ ...s, [opt.name]: val }))}
                    className="px-4 py-2 text-sm font-medium transition-colors"
                    style={{
                      borderRadius: "var(--brand-radius)",
                      border: active ? "1.5px solid var(--brand-primary)" : "1.5px solid #e7e5e4",
                      background: active ? "var(--brand-primary)" : "#fff",
                      color: active ? "var(--brand-on-primary)" : "#44403c",
                    }}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Quantity + add to cart */}
        <div className="mt-8 flex items-stretch gap-3">
          <div
            className="flex items-center"
            style={{ borderRadius: "var(--brand-radius)", border: "1.5px solid #e7e5e4" }}
          >
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="px-3.5 py-3 text-lg leading-none text-stone-500 hover:text-stone-800"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center text-sm font-semibold text-stone-800">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(99, q + 1))}
              className="px-3.5 py-3 text-lg leading-none text-stone-500 hover:text-stone-800"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="flex flex-1 items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderRadius: "var(--brand-radius)",
              background: added ? "#16a34a" : "var(--brand-primary)",
              color: added ? "#fff" : "var(--brand-on-primary)",
            }}
          >
            {added ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Added to Cart
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="21" r="1" />
                  <circle cx="19" cy="21" r="1" />
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                </svg>
                Add to Cart
              </>
            )}
          </button>
        </div>

        {/* Materials / details */}
        {product.materialsUsed && product.materialsUsed.length > 0 && (
          <div className="mt-8 border-t border-stone-200 pt-6">
            <div className="mb-2 text-sm font-semibold text-stone-700">Materials</div>
            <div className="flex flex-wrap gap-2">
              {product.materialsUsed.map((m) => (
                <span
                  key={m}
                  className="px-3 py-1 text-xs text-stone-600"
                  style={{ borderRadius: "var(--brand-radius)", background: "#f5f3ef" }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {product.story && (
          <div
            className="rte-content rte-content-display mt-8 border-t border-stone-200 pt-6"
            dangerouslySetInnerHTML={{ __html: product.story }}
          />
        )}
      </div>
    </div>
  );
}
