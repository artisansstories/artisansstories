"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function OrderConfirmedContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "80px 24px 80px", textAlign: "center" }}>
      {/* Checkmark */}
      <div style={{
        width: 72, height: 72, borderRadius: "50%",
        background: "linear-gradient(135deg, #dcfce7, #bbf7d0)",
        border: "2px solid #86efac",
        margin: "0 auto 24px",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>

      <h1 style={{
        fontFamily: "var(--brand-font-heading)",
        fontSize: 30,
        fontWeight: 700,
        color: "#1c1917",
        marginBottom: 12,
      }}>
        Order confirmed!
      </h1>
      <p style={{ fontSize: 16, color: "#78716c", lineHeight: 1.65, marginBottom: 8 }}>
        Thank you for your purchase. You'll receive a confirmation email shortly.
      </p>
      {sessionId && (
        <p style={{ fontSize: 12, color: "#a8a29e", fontFamily: "monospace", marginBottom: 24 }}>
          Reference: {sessionId.slice(-12).toUpperCase()}
        </p>
      )}

      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "13px 28px",
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

export default function OrderConfirmedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: "center", color: "#78716c" }}>Loading…</div>}>
      <OrderConfirmedContent />
    </Suspense>
  );
}
