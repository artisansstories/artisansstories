"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart, formatPrice, CartItem } from "@/lib/cart";
import { useCartDrawer } from "./CartDrawerProvider";

interface ProductCardProduct {
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

interface ProductCardProps {
  product: ProductCardProduct;
}

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14" /><path d="M5 12h14" />
    </svg>
  );
}

function IconCheck({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const { openCart } = useCartDrawer();
  const [added, setAdded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const image = product.images[0];
  const discount = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round((1 - product.price / product.compareAtPrice) * 100)
    : null;

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    if (!product.variantId) return;

    const item: CartItem = {
      productId: product.id,
      variantId: product.variantId,
      name: product.name,
      variantName: "Default",
      price: product.price,
      quantity: 1,
      image: image?.url,
      slug: product.slug,
    };
    addItem(item);
    setAdded(true);
    openCart();
    setTimeout(() => setAdded(false), 2500);
  }

  return (
    <Link
      href={`/shop/${product.slug}`}
      style={{ textDecoration: "none", display: "block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <article style={{
        background: "#fff",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #ede8df",
        transition: "box-shadow 0.2s, transform 0.2s",
        boxShadow: hovered ? "0 8px 32px rgba(0,0,0,0.1)" : "0 2px 8px rgba(0,0,0,0.04)",
        transform: hovered ? "translateY(-2px)" : "none",
      }}>
        {/* Image */}
        <div style={{
          position: "relative",
          width: "100%",
          paddingBottom: "100%",
          background: "#f5f0e8",
          overflow: "hidden",
        }}>
          {image ? (
            <Image
              src={image.urlMedium ?? image.url}
              alt={image.altText ?? product.name}
              fill
              style={{
                objectFit: "cover",
                transition: "transform 0.3s ease",
                transform: hovered ? "scale(1.04)" : "scale(1)",
              }}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
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
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
              </svg>
            </div>
          )}

          {/* Badges */}
          <div style={{
            position: "absolute",
            top: 10,
            left: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}>
            {discount && (
              <span style={{
                background: "#e74c3c",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                padding: "3px 7px",
                borderRadius: 4,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                -{discount}%
              </span>
            )}
            {product.isFeatured && (
              <span style={{
                background: "#8B6914",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                padding: "3px 7px",
                borderRadius: 4,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                Featured
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div style={{ padding: "14px 14px 16px" }}>
          <h3 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 16,
            fontWeight: 600,
            color: "#3a2e24",
            margin: "0 0 6px",
            lineHeight: 1.3,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}>
            {product.name}
          </h3>

          {/* Price */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
              fontWeight: 600,
              color: "#8B6914",
            }}>
              {formatPrice(product.price)}
            </span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: "#aaa",
                textDecoration: "line-through",
              }}>
                {formatPrice(product.compareAtPrice)}
              </span>
            )}
          </div>

          {/* CTA Button */}
          {product.hasVariants ? (
            <div
              style={{
                display: "block",
                textAlign: "center",
                padding: "11px 16px",
                border: "1.5px solid #8B6914",
                borderRadius: 8,
                color: "#8B6914",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                transition: "background 0.15s",
                cursor: "pointer",
                background: hovered ? "rgba(139,105,20,0.05)" : "transparent",
              }}
            >
              Choose Options
            </div>
          ) : (
            <button
              onClick={handleAddToCart}
              style={{
                width: "100%",
                padding: "11px 16px",
                background: added ? "#27ae60" : "#8B6914",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                minHeight: 44,
              }}
              onMouseEnter={e => {
                if (!added) (e.currentTarget as HTMLElement).style.background = "#7a5c12";
              }}
              onMouseLeave={e => {
                if (!added) (e.currentTarget as HTMLElement).style.background = "#8B6914";
              }}
            >
              {added ? (
                <>
                  <IconCheck size={14} />
                  Added to Cart
                </>
              ) : (
                <>
                  <IconPlus size={14} />
                  Add to Cart
                </>
              )}
            </button>
          )}
        </div>
      </article>
    </Link>
  );
}
