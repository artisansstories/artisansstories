"use client";

import Link from "next/link";
import { useCart } from "./CartContext";

export default function CartIcon() {
  const { totalItems } = useCart();

  return (
    <Link
      href="/cart"
      aria-label={`Shopping cart${totalItems > 0 ? ` — ${totalItems} item${totalItems === 1 ? "" : "s"}` : ""}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 38,
        width: 38,
        borderRadius: "var(--brand-radius)",
        background: "var(--brand-primary)",
        color: "var(--brand-on-primary)",
        textDecoration: "none",
        flexShrink: 0,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="21" r="1" />
        <circle cx="19" cy="21" r="1" />
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
      </svg>
      {totalItems > 0 && (
        <span
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            background: "#ef4444",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
            lineHeight: 1,
            fontFamily: "system-ui, sans-serif",
            border: "2px solid #fff",
          }}
        >
          {totalItems > 99 ? "99+" : totalItems}
        </span>
      )}
    </Link>
  );
}
