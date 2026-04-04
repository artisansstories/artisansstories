"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart, formatPrice } from "@/lib/cart";

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconMinus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  );
}

function IconPlus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14" /><path d="M5 12h14" />
    </svg>
  );
}

function IconTrash({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconShoppingBag({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconShield({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconLock({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CartPage() {
  const { items, removeItem, updateQuantity, subtotal, discountCode, discountAmount, setDiscount, clearDiscount } = useCart();
  const [discountInput, setDiscountInput] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [discountLoading, setDiscountLoading] = useState(false);

  const total = subtotal - discountAmount;
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  async function handleApplyDiscount() {
    if (!discountInput.trim()) return;
    setDiscountLoading(true);
    setDiscountError("");
    try {
      const res = await fetch("/api/checkout/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: discountInput.trim(), subtotal }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDiscountError(data.error ?? "Invalid discount code");
        return;
      }
      const data = await res.json();
      setDiscount(discountInput.trim().toUpperCase(), data.discountAmount ?? 0);
      setDiscountInput("");
    } catch {
      setDiscountError("Failed to apply discount");
    } finally {
      setDiscountLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "64px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        textAlign: "center",
        minHeight: "60vh",
        justifyContent: "center",
      }}>
        <div style={{ color: "#c9b99a" }}>
          <IconShoppingBag size={64} />
        </div>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 32,
          fontWeight: 600,
          color: "#3a2e24",
        }}>
          Your cart is empty
        </h1>
        <p style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 15,
          color: "#9a876e",
          maxWidth: 360,
        }}>
          You haven&apos;t added anything to your cart yet. Discover handcrafted goods from El Salvador.
        </p>
        <Link
          href="/shop"
          style={{
            display: "inline-block",
            padding: "14px 28px",
            background: "#8B6914",
            color: "#fff",
            textDecoration: "none",
            borderRadius: 10,
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            fontWeight: 600,
            marginTop: 8,
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#7a5c12"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#8B6914"; }}
        >
          Shop Now
        </Link>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media (min-width: 1024px) {
          .cart-layout { flex-direction: row !important; }
          .cart-items-col { flex: 1 1 0% !important; min-width: 0 !important; }
          .cart-summary-col { width: 360px !important; flex-shrink: 0 !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 20px 64px" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 600,
            color: "#3a2e24",
            marginBottom: 4,
          }}>
            Your Cart
          </h1>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            color: "#9a876e",
          }}>
            {totalItems} {totalItems === 1 ? "item" : "items"}
          </p>
        </div>

        {/* Layout */}
        <div
          className="cart-layout"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 32,
            alignItems: "flex-start",
          }}
        >
          {/* Items */}
          <div className="cart-items-col" style={{ width: "100%" }}>
            <div style={{
              background: "#fff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              overflow: "hidden",
            }}>
              {/* Table header (desktop) */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 120px 40px",
                gap: 16,
                padding: "14px 20px",
                borderBottom: "1px solid #ede8df",
                background: "#faf7f2",
              }} className="cart-table-header">
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", letterSpacing: "0.06em", textTransform: "uppercase" }}>Product</span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center" }}>Quantity</span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "right" }}>Total</span>
                <span />
              </div>

              {/* Items */}
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {items.map((item, idx) => (
                  <li
                    key={item.variantId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 120px 40px",
                      gap: 16,
                      padding: "20px",
                      borderBottom: idx < items.length - 1 ? "1px solid #f0ece4" : "none",
                      alignItems: "center",
                    }}
                    className="cart-item-row"
                  >
                    {/* Product info */}
                    <div style={{ display: "flex", gap: 16, alignItems: "center", minWidth: 0 }}>
                      <div style={{
                        width: 80,
                        height: 80,
                        flexShrink: 0,
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "#f5f0e8",
                        position: "relative",
                      }}>
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            style={{ objectFit: "cover" }}
                            sizes="80px"
                          />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#c9b99a" }}>
                            <IconShoppingBag size={24} />
                          </div>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <Link
                          href={`/shop/${item.slug}`}
                          style={{
                            fontFamily: "'Cormorant Garamond', serif",
                            fontSize: 16,
                            fontWeight: 600,
                            color: "#3a2e24",
                            textDecoration: "none",
                            display: "block",
                            marginBottom: 3,
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#8B6914"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#3a2e24"; }}
                        >
                          {item.name}
                        </Link>
                        {item.variantName && item.variantName !== "Default" && (
                          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9a876e", margin: "0 0 4px" }}>
                            {item.variantName}
                          </p>
                        )}
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8B6914", fontWeight: 500 }}>
                          {formatPrice(item.price)}
                        </p>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1.5px solid #e0d5c5",
                      borderRadius: 8,
                      overflow: "hidden",
                      width: "fit-content",
                      margin: "0 auto",
                    }}>
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        style={{
                          width: 34,
                          height: 34,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "#6b5540",
                        }}
                        aria-label="Decrease"
                      >
                        <IconMinus />
                      </button>
                      <span style={{
                        width: 34,
                        textAlign: "center",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#3a2e24",
                      }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                        style={{
                          width: 34,
                          height: 34,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "#6b5540",
                        }}
                        aria-label="Increase"
                      >
                        <IconPlus />
                      </button>
                    </div>

                    {/* Total */}
                    <div style={{
                      textAlign: "right",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#8B6914",
                    }}>
                      {formatPrice(item.price * item.quantity)}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.variantId)}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#c9b99a",
                        padding: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 6,
                        transition: "color 0.15s, background 0.15s",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.color = "#c0392b";
                        (e.currentTarget as HTMLElement).style.background = "#fdf0ef";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.color = "#c9b99a";
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                      aria-label={`Remove ${item.name}`}
                    >
                      <IconTrash size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ marginTop: 16 }}>
              <Link
                href="/shop"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  color: "#8B6914",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "gap 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.gap = "10px"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.gap = "6px"; }}
              >
                ← Continue Shopping
              </Link>
            </div>
          </div>

          {/* Order Summary */}
          <div className="cart-summary-col" style={{ width: "100%" }}>
            <div style={{
              background: "#fff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              padding: 24,
              position: "sticky",
              top: 88,
            }}>
              <h2 style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 600,
                color: "#3a2e24",
                marginBottom: 20,
              }}>
                Order Summary
              </h2>

              {/* Subtotal */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#6b5540" }}>
                  Subtotal ({totalItems} {totalItems === 1 ? "item" : "items"})
                </span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, color: "#3a2e24" }}>
                  {formatPrice(subtotal)}
                </span>
              </div>

              {/* Discount */}
              {discountAmount > 0 && discountCode && (
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                  padding: "8px 10px",
                  background: "rgba(39,174,96,0.07)",
                  borderRadius: 6,
                }}>
                  <div>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#27ae60", fontWeight: 500 }}>
                      {discountCode}
                    </span>
                    <button
                      onClick={clearDiscount}
                      style={{
                        marginLeft: 8,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#9a876e",
                        fontSize: 11,
                        textDecoration: "underline",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#27ae60", fontWeight: 500 }}>
                    -{formatPrice(discountAmount)}
                  </span>
                </div>
              )}

              {/* Shipping */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#6b5540" }}>Shipping</span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#9a876e", fontStyle: "italic" }}>
                  Calculated at checkout
                </span>
              </div>

              {/* Divider */}
              <div style={{ borderTop: "1px solid #ede8df", marginBottom: 16 }} />

              {/* Total */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: "#3a2e24" }}>
                  Total
                </span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: "#8B6914" }}>
                  {formatPrice(total)}
                </span>
              </div>

              {/* Discount code input */}
              {!discountCode && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#5a4a38",
                    marginBottom: 8,
                  }}>
                    Discount Code
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Enter code"
                      value={discountInput}
                      onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(""); }}
                      onKeyDown={e => { if (e.key === "Enter") handleApplyDiscount(); }}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        border: "1.5px solid " + (discountError ? "#c0392b" : "#e0d5c5"),
                        borderRadius: 8,
                        fontSize: 13,
                        fontFamily: "'Inter', sans-serif",
                        color: "#3a2e24",
                        background: "#fff",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={handleApplyDiscount}
                      disabled={discountLoading || !discountInput.trim()}
                      style={{
                        padding: "10px 14px",
                        background: "#8B6914",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: discountLoading || !discountInput.trim() ? "not-allowed" : "pointer",
                        opacity: discountLoading || !discountInput.trim() ? 0.7 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {discountLoading ? "..." : "Apply"}
                    </button>
                  </div>
                  {discountError && (
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#c0392b", marginTop: 6 }}>
                      {discountError}
                    </p>
                  )}
                </div>
              )}

              {/* Checkout button */}
              <Link
                href="/checkout"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "16px 20px",
                  background: "#8B6914",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: 10,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  marginBottom: 12,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#7a5c12"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#8B6914"; }}
              >
                Proceed to Checkout
              </Link>

              {/* Security badges */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "14px",
                background: "#faf7f2",
                borderRadius: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#8B6914" }}><IconShield size={14} /></span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#6b5540" }}>
                    Secure SSL encrypted checkout
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#8B6914" }}><IconLock size={14} /></span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#6b5540" }}>
                    Your payment info is protected
                  </span>
                </div>
                <p style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  color: "#9a876e",
                  margin: 0,
                  textAlign: "center",
                  marginTop: 4,
                }}>
                  We accept Visa, Mastercard, Amex & more
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .cart-table-header { display: none !important; }
          .cart-item-row {
            grid-template-columns: 1fr auto !important;
            grid-template-rows: auto auto !important;
          }
        }
      `}</style>
    </>
  );
}
