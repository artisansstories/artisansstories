"use client";
import { useEffect } from "react";

export default function OrderDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("OrderDetail page error:", error);
  }, [error]);

  return (
    <div style={{
      maxWidth: 600, margin: "80px auto", padding: "0 20px", textAlign: "center",
      fontFamily: "'Inter', sans-serif",
    }}>
      <p style={{ fontSize: 15, color: "#b91c1c", marginBottom: 16 }}>
        Something went wrong loading this order.
      </p>
      {error?.digest && (
        <p style={{ fontSize: 12, color: "#9a876e", marginBottom: 16 }}>
          Error ID: {error.digest}
        </p>
      )}
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{ padding: "10px 24px", borderRadius: 8, background: "#8B6914", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Try Again
        </button>
        <a
          href="/account/orders"
          style={{ padding: "10px 24px", borderRadius: 8, background: "#fff", color: "#8B6914", border: "1px solid #8B6914", fontSize: 14, fontWeight: 600, display: "inline-block" }}
        >
          Back to Orders
        </a>
      </div>
    </div>
  );
}
