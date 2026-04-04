"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface PageProps {
  params: Promise<{ orderNumber: string }>;
}

export default function CheckoutSuccessPage({ params }: PageProps) {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [orderNumber, setOrderNumber] = useState<string>("");

  useEffect(() => {
    params.then((p) => setOrderNumber(p.orderNumber));
  }, [params]);

  return (
    <div
      style={{
        maxWidth: 600,
        margin: "0 auto",
        padding: "64px 24px",
        textAlign: "center",
      }}
    >
      {/* Success Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 32px",
          boxShadow: "0 4px 24px rgba(139, 105, 20, 0.25)",
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      {/* Heading */}
      <h1
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontSize: 42,
          fontWeight: 700,
          color: "#3a2e24",
          marginBottom: 12,
          lineHeight: 1.2,
        }}
      >
        Order Confirmed!
      </h1>

      <p
        style={{
          fontSize: 17,
          color: "#7a6852",
          marginBottom: 32,
          lineHeight: 1.6,
        }}
      >
        Thank you for shopping with Artisans Stories.
        <br />
        Your handcrafted items are being prepared with care.
      </p>

      {/* Order Number Box */}
      {orderNumber && (
        <div
          style={{
            background: "#ffffff",
            border: "1.5px solid #C9A84C",
            borderRadius: 12,
            padding: "20px 32px",
            marginBottom: 24,
            display: "inline-block",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#9a876e", marginBottom: 4 }}>
            Your order number
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              color: "#8B6914",
              letterSpacing: "1px",
            }}
          >
            {orderNumber}
          </p>
        </div>
      )}

      {/* Email Confirmation */}
      {email && (
        <p
          style={{
            fontSize: 14,
            color: "#7a6852",
            marginBottom: 40,
          }}
        >
          A confirmation email has been sent to{" "}
          <strong style={{ color: "#3a2e24" }}>{email}</strong>.
          <br />
          {"We'll"} notify you when your order ships.
        </p>
      )}

      {!email && (
        <p
          style={{
            fontSize: 14,
            color: "#7a6852",
            marginBottom: 40,
          }}
        >
          A confirmation email has been sent to your email address.
          <br />
          {"We'll"} notify you when your order ships.
        </p>
      )}

      {/* Artisan Message */}
      <div
        style={{
          background: "#faf7f2",
          border: "1px solid #ede8df",
          borderRadius: 12,
          padding: "20px 24px",
          marginBottom: 40,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>🤝</span>
          <div>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 15,
                fontWeight: 600,
                color: "#3a2e24",
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              }}
            >
              Crafted with intention
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#7a6852", lineHeight: 1.6 }}>
              Each item in your order has been handcrafted by skilled artisans from El Salvador,
              preserving generations of tradition in every piece.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <a
          href="/shop"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 32px",
            background: "#8B6914",
            color: "#ffffff",
            textDecoration: "none",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 15,
            transition: "background 0.15s",
          }}
        >
          Continue Shopping
        </a>
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 32px",
            background: "#ffffff",
            color: "#8B6914",
            textDecoration: "none",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 15,
            border: "1.5px solid #8B6914",
          }}
        >
          Back to Home
        </a>
      </div>

      {/* Support */}
      <p style={{ marginTop: 40, fontSize: 13, color: "#9a876e" }}>
        Questions about your order?{" "}
        <a
          href="mailto:hello@artisansstories.com"
          style={{ color: "#8B6914", textDecoration: "none", fontWeight: 500 }}
        >
          hello@artisansstories.com
        </a>
      </p>
    </div>
  );
}
