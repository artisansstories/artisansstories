"use client";

import React, { useState, useEffect, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart, formatPrice, CartItem } from "@/lib/cart";
import { useCartDrawer } from "@/components/CartDrawerProvider";
import ProductCard from "@/components/ProductCard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductImage {
  id: string;
  url: string;
  urlMedium?: string | null;
  urlThumb?: string | null;
  altText?: string | null;
  variantId?: string | null;
  position: number;
}

interface Inventory {
  quantity: number;
  reservedQuantity: number;
  allowBackorder: boolean;
  trackedInventory: boolean;
}

interface ProductVariant {
  id: string;
  name: string;
  optionValues: Record<string, string>;
  sku?: string | null;
  price?: number | null;
  position: number;
  images: ProductImage[];
  inventory?: Inventory | null;
}

interface ProductOption {
  id: string;
  name: string;
  values: string[];
  position: number;
}

interface Category {
  id: string;
  slug: string;
  name: string;
}

interface Product {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  story?: string | null;
  price: number;
  compareAtPrice?: number | null;
  artisanName?: string | null;
  originCountry: string;
  materialsUsed: string[];
  tags: string[];
  weight?: number | null;
  weightUnit: string;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  dimensionUnit: string;
  isFeatured: boolean;
  images: ProductImage[];
  variants: ProductVariant[];
  options: ProductOption[];
  categories: Category[];
}

interface RelatedProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  isFeatured: boolean;
  hasVariants: boolean;
  variantId?: string | null;
  images: { url: string; urlMedium?: string | null; altText?: string | null }[];
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconMinus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  );
}

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14" /><path d="M5 12h14" />
    </svg>
  );
}

function IconCheck({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconTruck({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" /><rect x="9" y="11" width="14" height="10" rx="2" /><circle cx="12" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    </svg>
  );
}

function IconCraft({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProductDetailSkeleton() {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 20px" }}>
      <style>{`@keyframes shimmer { 0% { background-position: -200px 0 } 100% { background-position: calc(200px + 100%) 0 } }`}</style>
      <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 400px", minWidth: 0 }}>
          <div style={{ width: "100%", paddingBottom: "100%", borderRadius: 12, background: "linear-gradient(90deg,#f0ede8 25%,#ebe7e0 50%,#f0ede8 75%)", backgroundSize: "200px 100%", animation: "shimmer 1.5s infinite" }} />
        </div>
        <div style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {[200, 140, 100, 180, 56, 48].map((w, i) => (
            <div key={i} style={{ height: i < 2 ? 28 : i < 4 ? 20 : 48, width: `${w}px`, maxWidth: "100%", borderRadius: 6, background: "linear-gradient(90deg,#f0ede8 25%,#ebe7e0 50%,#f0ede8 75%)", backgroundSize: "200px 100%", animation: "shimmer 1.5s infinite" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<"description" | "story" | "details">("description");
  const [addedToCart, setAddedToCart] = useState(false);

  const { addItem } = useCart();
  const { openCart } = useCartDrawer();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/shop/products/${slug}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("Product not found");
          throw new Error("Failed to load product");
        }
        const data = await res.json();
        setProduct(data.product);
        setRelatedProducts(data.relatedProducts ?? []);

        // Initialize selected options with first value of each option
        if (data.product.options.length > 0) {
          const defaultOpts: Record<string, string> = {};
          data.product.options.forEach((opt: ProductOption) => {
            if (opt.values.length > 0) {
              defaultOpts[opt.name] = opt.values[0];
            }
          });
          setSelectedOptions(defaultOpts);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  if (loading) return <ProductDetailSkeleton />;

  if (error || !product) {
    return (
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "80px 20px", textAlign: "center" }}>
        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: "#3a2e24", marginBottom: 8 }}>
          {error === "Product not found" ? "Product Not Found" : "Something went wrong"}
        </p>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#9a876e", marginBottom: 20 }}>
          {error}
        </p>
        <Link
          href="/shop"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            background: "#8B6914",
            color: "#fff",
            textDecoration: "none",
            borderRadius: 8,
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
          }}
        >
          Back to Shop
        </Link>
      </div>
    );
  }

  // Find selected variant
  const selectedVariant = product.variants.find(v => {
    if (product.options.length === 0) return true;
    const vals = v.optionValues as Record<string, string>;
    return product.options.every(opt => vals[opt.name] === selectedOptions[opt.name]);
  }) ?? product.variants[0];

  const effectivePrice = selectedVariant?.price ?? product.price;
  const inventory = selectedVariant?.inventory;
  const availableQty = inventory?.trackedInventory
    ? Math.max(0, (inventory.quantity ?? 0) - (inventory.reservedQuantity ?? 0))
    : 999;
  const isOutOfStock = inventory?.trackedInventory && availableQty === 0 && !inventory.allowBackorder;
  const isLowStock = inventory?.trackedInventory && availableQty > 0 && availableQty <= 10;

  // When variant changes, update the displayed image if variant has images
  function handleOptionSelect(optionName: string, value: string) {
    const newOpts = { ...selectedOptions, [optionName]: value };
    setSelectedOptions(newOpts);

    // Find the matching variant and switch to its first image
    const matchingVariant = product!.variants.find(v => {
      const vals = v.optionValues as Record<string, string>;
      return product!.options.every(opt => vals[opt.name] === newOpts[opt.name]);
    });
    if (matchingVariant?.images.length) {
      const variantImageIdx = product!.images.findIndex(img => img.id === matchingVariant.images[0].id);
      if (variantImageIdx >= 0) setSelectedImage(variantImageIdx);
    }
  }

  function handleAddToCart() {
    if (!selectedVariant || isOutOfStock) return;
    const item: CartItem = {
      productId: product!.id,
      variantId: selectedVariant.id,
      name: product!.name,
      variantName: selectedVariant.name,
      price: effectivePrice,
      quantity,
      image: product!.images[0]?.url,
      slug: product!.slug,
      sku: selectedVariant.sku ?? undefined,
    };
    addItem(item);
    setAddedToCart(true);
    openCart();
    setTimeout(() => setAddedToCart(false), 3000);
  }

  function handleBuyNow() {
    handleAddToCart();
    // After adding, redirect to checkout
    window.location.href = "/checkout";
  }

  const TABS = [
    { id: "description" as const, label: "Description", show: !!product.description },
    { id: "story" as const, label: "Artisan Story", show: !!product.story },
    { id: "details" as const, label: "Materials & Details", show: true },
  ].filter(t => t.show);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px 64px" }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: -200px 0 } 100% { background-position: calc(200px + 100%) 0 } }
        @media (min-width: 768px) {
          .pdp-layout { flex-direction: row !important; }
          .pdp-gallery { flex: 0 0 50% !important; max-width: 50% !important; }
          .pdp-info { flex: 1 1 0% !important; }
          .pdp-thumbnails { flex-direction: column !important; width: 72px !important; }
          .pdp-gallery-inner { flex-direction: row !important; }
          .related-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 1024px) {
          .related-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>

      {/* Breadcrumb */}
      <nav style={{ marginBottom: 24, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/shop" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#9a876e", textDecoration: "none" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#8B6914"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9a876e"; }}
        >
          Shop
        </Link>
        {product.categories[0] && (
          <>
            <span style={{ color: "#c9b99a", fontSize: 12 }}>›</span>
            <Link
              href={`/shop?category=${product.categories[0].slug}`}
              style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#9a876e", textDecoration: "none" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#8B6914"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9a876e"; }}
            >
              {product.categories[0].name}
            </Link>
          </>
        )}
        <span style={{ color: "#c9b99a", fontSize: 12 }}>›</span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#3a2e24" }}>
          {product.name}
        </span>
      </nav>

      {/* Product Layout */}
      <div
        className="pdp-layout"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 40,
          marginBottom: 64,
          alignItems: "flex-start",
        }}
      >
        {/* Gallery */}
        <div className="pdp-gallery" style={{ width: "100%" }}>
          <div className="pdp-gallery-inner" style={{ display: "flex", flexDirection: "column-reverse", gap: 12 }}>
            {/* Thumbnails */}
            {product.images.length > 1 && (
              <div
                className="pdp-thumbnails"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: 8,
                  overflowX: "auto",
                  flexShrink: 0,
                }}
              >
                {product.images.map((img, idx) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(idx)}
                    style={{
                      width: 64,
                      height: 64,
                      flexShrink: 0,
                      borderRadius: 8,
                      overflow: "hidden",
                      border: idx === selectedImage ? "2px solid #8B6914" : "2px solid #ede8df",
                      cursor: "pointer",
                      padding: 0,
                      background: "#f5f0e8",
                      transition: "border-color 0.15s",
                      position: "relative",
                    }}
                    aria-label={`View image ${idx + 1}`}
                  >
                    <Image
                      src={img.urlThumb ?? img.urlMedium ?? img.url}
                      alt={img.altText ?? `${product.name} ${idx + 1}`}
                      fill
                      style={{ objectFit: "cover" }}
                      sizes="64px"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Main image */}
            <div style={{
              flex: 1,
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              background: "#f5f0e8",
              aspectRatio: "1 / 1",
            }}>
              {product.images[selectedImage] ? (
                <Image
                  src={product.images[selectedImage].urlMedium ?? product.images[selectedImage].url}
                  alt={product.images[selectedImage].altText ?? product.name}
                  fill
                  style={{ objectFit: "cover" }}
                  sizes="(max-width: 767px) 100vw, 50vw"
                  priority={selectedImage === 0}
                />
              ) : (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#c9b99a",
                }}>
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product Info */}
        <div className="pdp-info" style={{ width: "100%", minWidth: 0 }}>
          {/* Name */}
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(26px, 4vw, 36px)",
            fontWeight: 600,
            color: "#3a2e24",
            marginBottom: 8,
            lineHeight: 1.2,
          }}>
            {product.name}
          </h1>

          {/* Artisan */}
          {(product.artisanName || product.originCountry) && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 16,
              color: "#9a876e",
            }}>
              <IconCraft size={14} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13 }}>
                {product.artisanName ? `By ${product.artisanName}` : ""}
                {product.artisanName && product.originCountry ? " · " : ""}
                {product.originCountry}
              </span>
            </div>
          )}

          {/* Price */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 24 }}>
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 28,
              fontWeight: 700,
              color: "#8B6914",
            }}>
              {formatPrice(effectivePrice)}
            </span>
            {product.compareAtPrice && product.compareAtPrice > effectivePrice && (
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 18,
                color: "#aaa",
                textDecoration: "line-through",
              }}>
                {formatPrice(product.compareAtPrice)}
              </span>
            )}
            {product.compareAtPrice && product.compareAtPrice > effectivePrice && (
              <span style={{
                background: "#e74c3c",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 4,
                fontFamily: "'Inter', sans-serif",
              }}>
                Save {Math.round((1 - effectivePrice / product.compareAtPrice) * 100)}%
              </span>
            )}
          </div>

          {/* Options */}
          {product.options.map(option => (
            <div key={option.id} style={{ marginBottom: 20 }}>
              <p style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: "#5a4a38",
                marginBottom: 10,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}>
                {option.name}: <span style={{ fontWeight: 400, textTransform: "none" }}>{selectedOptions[option.name]}</span>
              </p>

              {option.name.toLowerCase() === "color" ? (
                // Color swatches
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {option.values.map(value => {
                    const isSelected = selectedOptions[option.name] === value;
                    return (
                      <button
                        key={value}
                        onClick={() => handleOptionSelect(option.name, value)}
                        title={value}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          border: isSelected ? "3px solid #8B6914" : "2px solid #e0d5c5",
                          cursor: "pointer",
                          padding: 0,
                          outline: isSelected ? "2px solid rgba(139,105,20,0.3)" : "none",
                          outlineOffset: 2,
                          background: value.toLowerCase(),
                          transition: "border-color 0.15s, outline 0.15s",
                          boxSizing: "border-box",
                        }}
                        aria-label={value}
                        aria-pressed={isSelected}
                      />
                    );
                  })}
                </div>
              ) : option.name.toLowerCase() === "size" ? (
                // Size buttons
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {option.values.map(value => {
                    const isSelected = selectedOptions[option.name] === value;
                    return (
                      <button
                        key={value}
                        onClick={() => handleOptionSelect(option.name, value)}
                        style={{
                          padding: "8px 16px",
                          border: isSelected ? "2px solid #8B6914" : "1.5px solid #e0d5c5",
                          borderRadius: 8,
                          background: isSelected ? "rgba(139,105,20,0.08)" : "#fff",
                          color: isSelected ? "#8B6914" : "#5a4a38",
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 13,
                          fontWeight: isSelected ? 600 : 400,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Dropdown for other options
                <select
                  value={selectedOptions[option.name] ?? ""}
                  onChange={e => handleOptionSelect(option.name, e.target.value)}
                  style={{
                    padding: "10px 32px 10px 12px",
                    border: "1.5px solid #e0d5c5",
                    borderRadius: 8,
                    background: "#fff",
                    color: "#3a2e24",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    outline: "none",
                    cursor: "pointer",
                    appearance: "none",
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239a876e' strokeWidth='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 10px center",
                  }}
                >
                  {option.values.map(value => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              )}
            </div>
          ))}

          {/* Inventory indicator */}
          <div style={{ marginBottom: 20 }}>
            {isOutOfStock ? (
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: "#c0392b",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#c0392b", display: "inline-block" }} />
                Out of Stock
              </span>
            ) : isLowStock ? (
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: "#e67e22",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e67e22", display: "inline-block" }} />
                Only {availableQty} left!
              </span>
            ) : (
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: "#27ae60",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#27ae60", display: "inline-block" }} />
                In Stock
              </span>
            )}
          </div>

          {/* Quantity */}
          <div style={{ marginBottom: 16 }}>
            <p style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "#5a4a38",
              marginBottom: 8,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}>
              Quantity
            </p>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              border: "1.5px solid #e0d5c5",
              borderRadius: 8,
              overflow: "hidden",
            }}>
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                style={{
                  width: 42,
                  height: 42,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b5540",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f5f0e8"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                aria-label="Decrease"
              >
                <IconMinus size={14} />
              </button>
              <span style={{
                width: 48,
                textAlign: "center",
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                fontWeight: 500,
                color: "#3a2e24",
              }}>
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(q => q + 1)}
                style={{
                  width: 42,
                  height: 42,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b5540",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f5f0e8"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                aria-label="Increase"
              >
                <IconPlus size={14} />
              </button>
            </div>
          </div>

          {/* Add to cart + Buy now */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              style={{
                width: "100%",
                padding: "16px 20px",
                background: isOutOfStock ? "#c9b99a" : addedToCart ? "#27ae60" : "#8B6914",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                fontWeight: 600,
                cursor: isOutOfStock ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                minHeight: 56,
              }}
              onMouseEnter={e => {
                if (!isOutOfStock && !addedToCart)
                  (e.currentTarget as HTMLElement).style.background = "#7a5c12";
              }}
              onMouseLeave={e => {
                if (!isOutOfStock && !addedToCart)
                  (e.currentTarget as HTMLElement).style.background = "#8B6914";
              }}
            >
              {addedToCart ? (
                <><IconCheck size={18} /> Added to Cart</>
              ) : isOutOfStock ? (
                "Out of Stock"
              ) : (
                "Add to Cart"
              )}
            </button>

            {!isOutOfStock && (
              <button
                onClick={handleBuyNow}
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  background: "transparent",
                  border: "2px solid #8B6914",
                  borderRadius: 10,
                  color: "#8B6914",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.15s",
                  minHeight: 48,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,105,20,0.06)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                Buy It Now
              </button>
            )}
          </div>

          {/* Shipping note */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 14px",
            background: "rgba(139,105,20,0.06)",
            borderRadius: 8,
            marginBottom: 28,
          }}>
            <span style={{ color: "#8B6914", flexShrink: 0 }}>
              <IconTruck size={16} />
            </span>
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: "#6b5540",
            }}>
              Free shipping on orders over $75
            </span>
          </div>

          {/* Tabs */}
          {TABS.length > 0 && (
            <div>
              <div style={{
                display: "flex",
                borderBottom: "1px solid #ede8df",
                marginBottom: 20,
              }}>
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: "10px 16px",
                      background: "transparent",
                      border: "none",
                      borderBottom: activeTab === tab.id ? "2px solid #8B6914" : "2px solid transparent",
                      marginBottom: -1,
                      cursor: "pointer",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      fontWeight: activeTab === tab.id ? 600 : 400,
                      color: activeTab === tab.id ? "#8B6914" : "#9a876e",
                      transition: "color 0.15s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                color: "#5a4a38",
                lineHeight: 1.7,
              }}>
                {activeTab === "description" && product.description && (
                  <p style={{ whiteSpace: "pre-wrap" }}>{product.description}</p>
                )}
                {activeTab === "story" && product.story && (
                  <p style={{ whiteSpace: "pre-wrap", fontStyle: "italic" }}>{product.story}</p>
                )}
                {activeTab === "details" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {product.materialsUsed.length > 0 && (
                      <div>
                        <strong style={{ color: "#3a2e24" }}>Materials:</strong>{" "}
                        {product.materialsUsed.join(", ")}
                      </div>
                    )}
                    {product.originCountry && (
                      <div>
                        <strong style={{ color: "#3a2e24" }}>Origin:</strong>{" "}
                        {product.originCountry}
                      </div>
                    )}
                    {product.artisanName && (
                      <div>
                        <strong style={{ color: "#3a2e24" }}>Artisan:</strong>{" "}
                        {product.artisanName}
                      </div>
                    )}
                    {product.weight && (
                      <div>
                        <strong style={{ color: "#3a2e24" }}>Weight:</strong>{" "}
                        {product.weight} {product.weightUnit}
                      </div>
                    )}
                    {(product.length || product.width || product.height) && (
                      <div>
                        <strong style={{ color: "#3a2e24" }}>Dimensions:</strong>{" "}
                        {[product.length, product.width, product.height].filter(Boolean).join(" × ")} {product.dimensionUnit}
                      </div>
                    )}
                    {product.tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                        {product.tags.map(tag => (
                          <span key={tag} style={{
                            padding: "4px 10px",
                            background: "rgba(139,105,20,0.08)",
                            borderRadius: 20,
                            fontSize: 12,
                            color: "#8B6914",
                            fontWeight: 500,
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section>
          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(22px, 3vw, 30px)",
            fontWeight: 600,
            color: "#3a2e24",
            marginBottom: 24,
          }}>
            You might also like
          </h2>
          <div
            className="related-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 16,
            }}
          >
            {relatedProducts.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
