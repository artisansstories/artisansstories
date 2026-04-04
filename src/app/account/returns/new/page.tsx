"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type OrderItem = {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  price: number;
  total: number;
  product?: {
    images: Array<{ url: string; urlThumb?: string | null; altText?: string | null }>;
  } | null;
};

type Order = {
  id: string;
  orderNumber: string;
  items: OrderItem[];
};

const REASON_LABELS: Record<string, string> = {
  DEFECTIVE: "Defective / Damaged",
  WRONG_ITEM: "Wrong Item Received",
  NOT_AS_DESCRIBED: "Not as Described",
  CHANGED_MIND: "Changed My Mind",
  OTHER: "Other",
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

type SelectedItem = {
  orderItemId: string;
  quantity: number;
  reason: string;
  note: string;
};

function NewReturnForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("order");

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [customerNote, setCustomerNote] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, SelectedItem>>({});

  useEffect(() => {
    if (!orderId) {
      setError("No order specified.");
      setLoading(false);
      return;
    }

    fetch("/api/account/orders")
      .then(res => {
        if (res.status === 401) {
          router.replace("/account/login");
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (!data) return;
        const found = data.orders?.find((o: Order) => o.id === orderId);
        if (!found) {
          setError("Order not found.");
        } else {
          setOrder(found);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load order.");
        setLoading(false);
      });
  }, [orderId, router]);

  function toggleItem(item: OrderItem) {
    setSelectedItems(prev => {
      if (prev[item.id]) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return {
        ...prev,
        [item.id]: {
          orderItemId: item.id,
          quantity: item.quantity,
          reason: "DEFECTIVE",
          note: "",
        },
      };
    });
  }

  function updateItem(itemId: string, field: "quantity" | "reason" | "note", value: string | number) {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const items = Object.values(selectedItems);
    if (items.length === 0) {
      setError("Please select at least one item to return.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/account/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order!.id,
          items,
          customerNote,
        }),
      });

      if (res.ok) {
        router.push(`/account/orders/${order!.orderNumber}?returned=1`);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to submit return request.");
        setSubmitting(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 15, color: "#c0392b", fontFamily: "'Inter',sans-serif", marginBottom: 16 }}>{error}</p>
        <a href="/account/orders" style={{ fontSize: 14, color: "#8B6914", fontFamily: "'Inter',sans-serif", textDecoration: "underline" }}>
          Back to Orders
        </a>
      </div>
    );
  }

  if (!order) return null;

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 28 }}>
        <a href={`/account/orders/${order.orderNumber}`} style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter',sans-serif", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to order {order.orderNumber}
        </a>

        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "clamp(26px,5vw,36px)",
          fontWeight: 400,
          color: "#3a2e24",
          marginBottom: 8,
        }}>
          Request a Return
        </h1>
        <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter',sans-serif" }}>
          Select the items you&apos;d like to return and provide the reason.
        </p>
      </div>

      {error && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 10,
          background: "#fff5f5",
          border: "1px solid rgba(220,80,60,0.2)",
          color: "#c0392b",
          fontSize: 13,
          fontFamily: "'Inter',sans-serif",
          marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      {/* Items */}
      <div style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #ede8df",
        overflow: "hidden",
        marginBottom: 20,
      }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0ece4", background: "#fdfaf6" }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
            Select Items to Return
          </h2>
        </div>

        {order.items.map((item, idx) => {
          const isSelected = !!selectedItems[item.id];
          const sel = selectedItems[item.id];
          const imgUrl = item.product?.images[0]?.urlThumb ?? item.product?.images[0]?.url;

          return (
            <div
              key={item.id}
              style={{
                padding: "16px 24px",
                borderBottom: idx < order.items.length - 1 ? "1px solid #f0ece4" : "none",
                background: isSelected ? "rgba(139,105,20,0.03)" : "transparent",
                transition: "background 0.15s",
              }}
            >
              {/* Item row */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", cursor: "pointer" }} onClick={() => toggleItem(item)}>
                {/* Checkbox */}
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: `2px solid ${isSelected ? "#8B6914" : "#d0c4b0"}`,
                  background: isSelected ? "linear-gradient(135deg, #8B6914, #C9A84C)" : "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                  transition: "all 0.15s",
                }}>
                  {isSelected && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>

                {/* Image */}
                <div style={{
                  width: 56, height: 56,
                  borderRadius: 8,
                  background: imgUrl ? "transparent" : "#f5f0e8",
                  border: "1px solid #ede8df",
                  flexShrink: 0,
                  overflow: "hidden",
                }}>
                  {imgUrl && <img src={imgUrl} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: "0 0 3px" }}>
                    {item.title}
                  </p>
                  {item.variantTitle && (
                    <p style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter',sans-serif", margin: "0 0 3px" }}>
                      {item.variantTitle}
                    </p>
                  )}
                  <p style={{ fontSize: 12, color: "#b09878", fontFamily: "'Inter',sans-serif", margin: 0 }}>
                    Qty {item.quantity} &times; {formatPrice(item.price)}
                  </p>
                </div>
              </div>

              {/* Selected item controls */}
              {isSelected && (
                <div style={{ marginTop: 14, marginLeft: 36, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {/* Quantity */}
                    <div style={{ flex: "0 0 auto" }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                        Qty to Return
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={item.quantity}
                        value={sel.quantity}
                        onChange={e => updateItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                        style={{
                          width: 72,
                          height: 40,
                          padding: "0 12px",
                          borderRadius: 8,
                          border: "1.5px solid #e0d5c5",
                          background: "#fdfaf6",
                          fontSize: 14,
                          color: "#3a2e24",
                          fontFamily: "'Inter',sans-serif",
                          outline: "none",
                        }}
                        onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
                        onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>

                    {/* Reason */}
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                        Reason
                      </label>
                      <select
                        value={sel.reason}
                        onChange={e => updateItem(item.id, "reason", e.target.value)}
                        style={{
                          width: "100%",
                          height: 40,
                          padding: "0 12px",
                          borderRadius: 8,
                          border: "1.5px solid #e0d5c5",
                          background: "#fdfaf6",
                          fontSize: 14,
                          color: "#3a2e24",
                          fontFamily: "'Inter',sans-serif",
                          outline: "none",
                        }}
                        onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
                        onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
                        onClick={e => e.stopPropagation()}
                      >
                        {Object.entries(REASON_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                      Note (optional)
                    </label>
                    <input
                      type="text"
                      value={sel.note}
                      onChange={e => updateItem(item.id, "note", e.target.value)}
                      placeholder="Any additional details..."
                      style={{
                        width: "100%",
                        height: 40,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: "1.5px solid #e0d5c5",
                        background: "#fdfaf6",
                        fontSize: 14,
                        color: "#3a2e24",
                        fontFamily: "'Inter',sans-serif",
                        outline: "none",
                      }}
                      onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
                      onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Customer note */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
          Additional Notes (optional)
        </label>
        <textarea
          value={customerNote}
          onChange={e => setCustomerNote(e.target.value)}
          placeholder="Any additional information about your return request..."
          rows={3}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 10,
            border: "1.5px solid #e0d5c5",
            background: "#fff",
            fontSize: 14,
            color: "#3a2e24",
            fontFamily: "'Inter',sans-serif",
            resize: "vertical",
            outline: "none",
          }}
          onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
          onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
        />
      </div>

      {/* Submit */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <a
          href={`/account/orders/${order.orderNumber}`}
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: "1.5px solid #e0d5c5",
            color: "#6b5540",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "'Inter',sans-serif",
            textDecoration: "none",
          }}
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={submitting || Object.keys(selectedItems).length === 0}
          style={{
            padding: "12px 28px",
            borderRadius: 10,
            border: "none",
            background: submitting || Object.keys(selectedItems).length === 0
              ? "#c8a84c"
              : "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "'Inter',sans-serif",
            cursor: submitting || Object.keys(selectedItems).length === 0 ? "not-allowed" : "pointer",
            opacity: submitting || Object.keys(selectedItems).length === 0 ? 0.7 : 1,
            boxShadow: "0 3px 12px rgba(139,105,20,0.25)",
            transition: "opacity 0.15s",
          }}
        >
          {submitting ? "Submitting…" : `Submit Return Request (${Object.keys(selectedItems).length} item${Object.keys(selectedItems).length !== 1 ? "s" : ""})`}
        </button>
      </div>

    </form>
  );
}

export default function NewReturnPage() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "clamp(24px,4vw,48px) 20px" }}>
      <Suspense fallback={
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      }>
        <NewReturnForm />
      </Suspense>
    </div>
  );
}
