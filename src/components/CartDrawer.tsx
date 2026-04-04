"use client";

import React, { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart, formatPrice } from "@/lib/cart";
import { useCartDrawer } from "./CartDrawerProvider";

function IconX({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

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

function IconShoppingBag({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

export default function CartDrawer() {
  const { isOpen, closeCart } = useCartDrawer();
  const { items, removeItem, updateQuantity, subtotal, discountAmount } = useCart();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (isOpen && drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        closeCart();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, closeCart]);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeCart();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [closeCart]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = subtotal - discountAmount;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 100,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "all" : "none",
          transition: "opacity 0.25s ease",
        }}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px, 100vw)",
          background: "#fff",
          zIndex: 101,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 20px 16px",
          borderBottom: "1px solid #ede8df",
          flexShrink: 0,
        }}>
          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 22,
            fontWeight: 600,
            color: "#3a2e24",
            margin: 0,
          }}>
            Your Cart {totalItems > 0 && (
              <span style={{
                fontSize: 14,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 400,
                color: "#9a876e",
              }}>
                ({totalItems} {totalItems === 1 ? "item" : "items"})
              </span>
            )}
          </h2>
          <button
            onClick={closeCart}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#9a876e",
              padding: 8,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "#f5f0e8";
              (e.currentTarget as HTMLElement).style.color = "#3a2e24";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#9a876e";
            }}
            aria-label="Close cart"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
          {items.length === 0 ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 16,
              padding: "40px 0",
              color: "#9a876e",
            }}>
              <IconShoppingBag size={48} />
              <p style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 20,
                color: "#3a2e24",
                margin: 0,
              }}>
                Your cart is empty
              </p>
              <p style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                color: "#9a876e",
                margin: 0,
                textAlign: "center",
              }}>
                Discover handcrafted goods from El Salvador
              </p>
              <Link
                href="/shop"
                onClick={closeCart}
                style={{
                  display: "inline-block",
                  padding: "12px 24px",
                  background: "#8B6914",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: 8,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  marginTop: 8,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#7a5c12"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#8B6914"; }}
              >
                Start Shopping
              </Link>
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0" }}>
              {items.map(item => (
                <li key={item.variantId} style={{
                  display: "flex",
                  gap: 14,
                  padding: "16px 0",
                  borderBottom: "1px solid #f0ece4",
                  alignItems: "flex-start",
                }}>
                  {/* Image */}
                  <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    overflow: "hidden",
                    flexShrink: 0,
                    background: "#f5f0e8",
                    position: "relative",
                  }}>
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        style={{ objectFit: "cover" }}
                        sizes="72px"
                      />
                    ) : (
                      <div style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#c9b99a",
                      }}>
                        <IconShoppingBag size={24} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/shop/${item.slug}`}
                      onClick={closeCart}
                      style={{
                        fontFamily: "'Cormorant Garamond', serif",
                        fontSize: 15,
                        fontWeight: 600,
                        color: "#3a2e24",
                        textDecoration: "none",
                        display: "block",
                        marginBottom: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </Link>
                    {item.variantName && item.variantName !== "Default" && (
                      <p style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        color: "#9a876e",
                        margin: "0 0 8px",
                      }}>
                        {item.variantName}
                      </p>
                    )}

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      {/* Qty controls */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        border: "1px solid #e0d5c5",
                        borderRadius: 6,
                        overflow: "hidden",
                      }}>
                        <button
                          onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                          style={{
                            width: 30,
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "#6b5540",
                          }}
                          aria-label="Decrease quantity"
                        >
                          <IconMinus size={12} />
                        </button>
                        <span style={{
                          width: 28,
                          textAlign: "center",
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#3a2e24",
                        }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                          style={{
                            width: 30,
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "#6b5540",
                          }}
                          aria-label="Increase quantity"
                        >
                          <IconPlus size={12} />
                        </button>
                      </div>

                      {/* Price */}
                      <span style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#8B6914",
                      }}>
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(item.variantId)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "#c9b99a",
                      padding: 4,
                      flexShrink: 0,
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#c0392b"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#c9b99a"; }}
                    aria-label={`Remove ${item.name}`}
                  >
                    <IconX size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{
            borderTop: "1px solid #ede8df",
            padding: "16px 20px 20px",
            flexShrink: 0,
          }}>
            {/* Subtotal */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: discountAmount > 0 ? 8 : 16,
            }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#6b5540" }}>
                Subtotal
              </span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: "#3a2e24" }}>
                {formatPrice(subtotal)}
              </span>
            </div>

            {discountAmount > 0 && (
              <>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#27ae60" }}>
                    Discount
                  </span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#27ae60" }}>
                    -{formatPrice(discountAmount)}
                  </span>
                </div>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: "#3a2e24" }}>
                    Total
                  </span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#8B6914" }}>
                    {formatPrice(total)}
                  </span>
                </div>
              </>
            )}

            <p style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              color: "#9a876e",
              textAlign: "center",
              margin: "0 0 12px",
            }}>
              Shipping &amp; taxes calculated at checkout
            </p>

            {/* Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link
                href="/cart"
                onClick={closeCart}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "13px 20px",
                  border: "1.5px solid #8B6914",
                  borderRadius: 8,
                  color: "#8B6914",
                  textDecoration: "none",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#fdf5ea"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                View Cart
              </Link>
              <Link
                href="/checkout"
                onClick={closeCart}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "14px 20px",
                  background: "#8B6914",
                  borderRadius: 8,
                  color: "#fff",
                  textDecoration: "none",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#7a5c12"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#8B6914"; }}
              >
                Checkout
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
