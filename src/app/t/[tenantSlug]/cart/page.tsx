"use client";

/**
 * /t/[tenantSlug]/cart — Shopping cart page for the white-label storefront.
 *
 * Reads cart from CartContext (localStorage). "Checkout" calls
 * POST /api/v1/store/checkout/session with the tenant's API key via a
 * server action, then redirects to the Stripe-hosted checkout URL.
 *
 * Note: checkout requires a valid API key with checkout:create scope.
 * We call our own internal checkout route (not the public API key route) so
 * the tenant's cart can check out without exposing keys client-side.
 */

import Link from "next/link";
import { useState } from "react";
import { useCart } from "../_components/CartContext";

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export default function CartPage() {
  const { items, totalItems, totalAmount, removeItem, updateQty, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We redirect to Stripe checkout via our internal API route
  async function handleCheckout() {
    if (items.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const origin = window.location.origin;
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
          successUrl: `${origin}/order-confirmed?cleared=1`,
          cancelUrl: `${origin}/cart`,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.url) {
        throw new Error(data.message ?? data.error ?? "Checkout failed — please try again.");
      }

      clearCart();
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🛒</div>
        <h1 style={{ fontFamily: "var(--brand-font-heading)", fontSize: 26, fontWeight: 700, color: "#1c1917", marginBottom: 10 }}>
          Your cart is empty
        </h1>
        <p style={{ color: "#78716c", fontSize: 15, marginBottom: 28 }}>
          Add something from the store and it will show up here.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 28px",
            borderRadius: "var(--brand-radius)",
            background: "var(--brand-primary)",
            color: "var(--brand-on-primary)",
            fontWeight: 600,
            fontSize: 15,
            textDecoration: "none",
          }}
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px 80px" }}>
      <h1 style={{ fontFamily: "var(--brand-font-heading)", fontSize: 28, fontWeight: 700, color: "#1c1917", marginBottom: 28 }}>
        Shopping Cart
        <span style={{ fontSize: 16, fontWeight: 500, color: "#78716c", marginLeft: 12 }}>
          ({totalItems} {totalItems === 1 ? "item" : "items"})
        </span>
      </h1>

      {/* Line items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 28 }}>
        {items.map(item => (
          <div
            key={item.variantId}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
              padding: 16,
              background: "#fff",
              borderRadius: "var(--brand-radius)",
              border: "1px solid #e7e5e4",
            }}
          >
            {/* Image */}
            <div style={{ width: 80, height: 80, flexShrink: 0, borderRadius: 8, overflow: "hidden", background: "#f5f3ef" }}>
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#d6d3d1" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                </div>
              )}
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href={`/${item.productSlug}`} style={{ fontWeight: 600, fontSize: 15, color: "#1c1917", textDecoration: "none" }}>
                {item.name}
              </Link>
              {item.variantName && item.variantName !== "Default" && (
                <p style={{ fontSize: 13, color: "#78716c", margin: "2px 0 0" }}>{item.variantName}</p>
              )}
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-primary)", margin: "6px 0 0" }}>
                {formatPrice(item.price)}
              </p>
            </div>

            {/* Quantity + remove */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e7e5e4", borderRadius: "var(--brand-radius)" }}>
                <button
                  onClick={() => updateQty(item.variantId, item.quantity - 1)}
                  style={{ padding: "6px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "#78716c" }}
                  aria-label="Decrease"
                >−</button>
                <span style={{ minWidth: 28, textAlign: "center", fontSize: 14, fontWeight: 600 }}>{item.quantity}</span>
                <button
                  onClick={() => updateQty(item.variantId, item.quantity + 1)}
                  style={{ padding: "6px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "#78716c" }}
                  aria-label="Increase"
                >+</button>
              </div>
              <button
                onClick={() => removeItem(item.variantId)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a8a29e", display: "flex", alignItems: "center", gap: 4, fontSize: 13, padding: 0 }}
                aria-label="Remove item"
              >
                <IconTrash /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Order summary */}
      <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: "var(--brand-radius)", padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: "#78716c" }}>
          <span>Subtotal ({totalItems} {totalItems === 1 ? "item" : "items"})</span>
          <span>{formatPrice(totalAmount)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 12, color: "#a8a29e" }}>
          <span>Shipping &amp; tax calculated at checkout</span>
        </div>
        <div style={{ borderTop: "1px solid #f5f5f4", paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#1c1917" }}>
          <span>Total</span>
          <span>{formatPrice(totalAmount)}</span>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 14, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading}
        style={{
          width: "100%",
          padding: "16px 24px",
          borderRadius: "var(--brand-radius)",
          border: "none",
          background: loading ? "#a8a29e" : "var(--brand-primary)",
          color: "var(--brand-on-primary)",
          fontSize: 16,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          transition: "opacity 0.15s",
        }}
      >
        {loading ? (
          <>
            <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite" }} />
            Redirecting to checkout…
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Proceed to Checkout
          </>
        )}
      </button>

      <p style={{ textAlign: "center", fontSize: 12, color: "#a8a29e", marginTop: 12 }}>
        Secure checkout powered by Stripe
      </p>

      <div style={{ textAlign: "center", marginTop: 12 }}>
        <Link href="/" style={{ fontSize: 14, color: "var(--brand-primary)", textDecoration: "none" }}>
          ← Continue Shopping
        </Link>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
