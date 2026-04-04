"use client";

import { useState, useEffect, use } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = "PENDING" | "PROCESSING" | "FULFILLED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";
type FinancialStatus = "PENDING" | "PAID" | "PARTIALLY_PAID" | "REFUNDED" | "PARTIALLY_REFUNDED" | "VOIDED";
type FulfillmentStatus = "PENDING" | "OPEN" | "SUCCESS" | "CANCELLED" | "ERROR";

interface OrderItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: number;
  total: number;
  fulfillmentStatus: string | null;
  productSnapshot: Record<string, unknown>;
}

interface Fulfillment {
  id: string;
  status: FulfillmentStatus;
  trackingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  items: unknown[];
  createdAt: string;
}

interface Customer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
}

interface ShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  financialStatus: FinancialStatus;
  email: string;
  phone: string | null;
  shippingAddress: ShippingAddress;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  currency: string;
  discountCode: string | null;
  customerNote: string | null;
  adminNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  stripePaymentIntentId: string | null;
  customer: Customer | null;
  items: OrderItem[];
  fulfillments: Fulfillment[];
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(dateStr));
}

function formatDateOnly(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(dateStr));
}

function getTrackingUrl(company: string, number: string): string {
  const c = company.toLowerCase();
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${number}`;
  if (c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
  if (c.includes("dhl")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${number}`;
  return `https://www.google.com/search?q=${encodeURIComponent(company + " tracking " + number)}`;
}

// ─── Status Badges ────────────────────────────────────────────────────────────

const ORDER_STATUS_STYLES: Record<OrderStatus, { bg: string; color: string }> = {
  PENDING:    { bg: "#fef3c7", color: "#b45309" },
  PROCESSING: { bg: "#dbeafe", color: "#1d4ed8" },
  FULFILLED:  { bg: "#e0e7ff", color: "#4338ca" },
  SHIPPED:    { bg: "#cffafe", color: "#0e7490" },
  DELIVERED:  { bg: "#dcfce7", color: "#15803d" },
  CANCELLED:  { bg: "#fee2e2", color: "#b91c1c" },
  REFUNDED:   { bg: "#f3f4f6", color: "#6b7280" },
};

const FINANCIAL_STATUS_STYLES: Record<FinancialStatus, { bg: string; color: string }> = {
  PENDING:            { bg: "#fef3c7", color: "#b45309" },
  PAID:               { bg: "#dcfce7", color: "#15803d" },
  PARTIALLY_PAID:     { bg: "#ecfdf5", color: "#059669" },
  REFUNDED:           { bg: "#fee2e2", color: "#b91c1c" },
  PARTIALLY_REFUNDED: { bg: "#fef2f2", color: "#dc2626" },
  VOIDED:             { bg: "#f3f4f6", color: "#6b7280" },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS_STYLES[status];
  return (
    <span style={{ display: "inline-block", padding: "3px 12px", borderRadius: 100, fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif", background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function FinancialBadge({ status }: { status: FinancialStatus }) {
  const s = FINANCIAL_STATUS_STYLES[status];
  const label = status.replace(/_/g, " ");
  return (
    <span style={{ display: "inline-block", padding: "3px 12px", borderRadius: 100, fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif", background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {label.charAt(0) + label.slice(1).toLowerCase()}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #ede8df", background: "#faf7f2" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: 20 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

const TIMELINE_STEPS: Array<{ key: OrderStatus; label: string }> = [
  { key: "PENDING", label: "Placed" },
  { key: "PROCESSING", label: "Processing" },
  { key: "FULFILLED", label: "Fulfilled" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "DELIVERED", label: "Delivered" },
];

const STATUS_ORDER: OrderStatus[] = ["PENDING", "PROCESSING", "FULFILLED", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

function OrderTimeline({ order }: { order: Order }) {
  const currentIdx = STATUS_ORDER.indexOf(order.status);
  const isCancelled = order.status === "CANCELLED" || order.status === "REFUNDED";

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, overflowX: "auto", paddingBottom: 4 }}>
      {TIMELINE_STEPS.map((step, i) => {
        const stepIdx = STATUS_ORDER.indexOf(step.key);
        const done = !isCancelled && currentIdx >= stepIdx;
        const active = !isCancelled && currentIdx === stepIdx;
        const isLast = i === TIMELINE_STEPS.length - 1;
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", flex: isLast ? "0 0 auto" : "1", minWidth: 80 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 70 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? (active ? "#8B6914" : "#C9A84C") : "#f0ebe3",
                border: `2px solid ${done ? "#8B6914" : "#e0d5c5"}`,
                flexShrink: 0,
              }}>
                {done
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  : <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#c0b09a" }} />
                }
              </div>
              <span style={{ fontSize: 11, fontFamily: "'Inter', sans-serif", fontWeight: active ? 700 : 500, color: done ? "#8B6914" : "#9a876e", whiteSpace: "nowrap" }}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div style={{ flex: 1, height: 2, background: done && !active ? "#C9A84C" : "#e0d5c5", margin: "0 4px", marginBottom: 22 }} />
            )}
          </div>
        );
      })}
      {isCancelled && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 70, marginLeft: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#fee2e2", border: "2px solid #dc2626", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </div>
          <span style={{ fontSize: 11, fontFamily: "'Inter', sans-serif", fontWeight: 700, color: "#b91c1c", whiteSpace: "nowrap" }}>
            {order.status === "REFUNDED" ? "Refunded" : "Cancelled"}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Fulfillment Form ─────────────────────────────────────────────────────────

const CARRIERS = ["UPS", "USPS", "FedEx", "DHL", "Other"];

interface FulfillFormProps {
  order: Order;
  onFulfilled: () => void;
}

function FulfillmentForm({ order, onFulfilled }: FulfillFormProps) {
  const [trackingCompany, setTrackingCompany] = useState("UPS");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [itemSelections, setItemSelections] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    order.items.filter(i => i.fulfillmentStatus !== "fulfilled").forEach(i => { init[i.id] = i.quantity; });
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-generate tracking URL when company+number changes
  useEffect(() => {
    if (trackingNumber) {
      setTrackingUrl(getTrackingUrl(trackingCompany, trackingNumber));
    }
  }, [trackingCompany, trackingNumber]);

  const unfulfilled = order.items.filter(i => i.fulfillmentStatus !== "fulfilled");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!trackingNumber.trim()) { setError("Tracking number is required"); return; }
    const items = Object.entries(itemSelections)
      .filter(([, qty]) => qty > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (items.length === 0) { setError("Select at least one item to fulfill"); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/fulfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCompany, trackingNumber, trackingUrl: trackingUrl || undefined, estimatedDelivery: estimatedDelivery || undefined, notifyCustomer, items }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to create fulfillment");
      }
      onFulfilled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 38, padding: "0 12px", border: "1px solid #e0d5c5", borderRadius: 8,
    fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#3a2e24", background: "#fff", outline: "none", boxSizing: "border-box",
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#7a6852", fontFamily: "'Inter', sans-serif", marginBottom: 5 }}>Carrier</label>
          <select value={trackingCompany} onChange={e => setTrackingCompany(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            {CARRIERS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#7a6852", fontFamily: "'Inter', sans-serif", marginBottom: 5 }}>Tracking Number *</label>
          <input type="text" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="1Z999AA10123456784" style={inputStyle} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#7a6852", fontFamily: "'Inter', sans-serif", marginBottom: 5 }}>Tracking URL</label>
          <input type="url" value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} placeholder="Auto-generated from carrier + number" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#7a6852", fontFamily: "'Inter', sans-serif", marginBottom: 5 }}>Estimated Delivery</label>
          <input type="date" value={estimatedDelivery} onChange={e => setEstimatedDelivery(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "#7a6852", fontFamily: "'Inter', sans-serif", margin: "0 0 8px" }}>Items to Fulfill</p>
        {unfulfilled.map(item => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0ebe3" }}>
            <input
              type="checkbox"
              checked={itemSelections[item.id] > 0}
              onChange={e => setItemSelections(prev => ({ ...prev, [item.id]: e.target.checked ? item.quantity : 0 }))}
              style={{ accentColor: "#8B6914", width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>{item.title}</p>
              {item.variantTitle && <p style={{ margin: 0, fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>{item.variantTitle}</p>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>Qty:</span>
              <input
                type="number"
                min={0}
                max={item.quantity}
                value={itemSelections[item.id] ?? 0}
                onChange={e => setItemSelections(prev => ({ ...prev, [item.id]: Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0)) }))}
                style={{ width: 56, height: 32, padding: "0 8px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 13, fontFamily: "'Inter', sans-serif", textAlign: "center" }}
              />
              <span style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>/ {item.quantity}</span>
            </div>
          </div>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 16 }}>
        <input type="checkbox" checked={notifyCustomer} onChange={e => setNotifyCustomer(e.target.checked)} style={{ accentColor: "#8B6914", width: 16, height: 16 }} />
        <span style={{ fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>Notify customer via email</span>
      </label>

      {error && (
        <p style={{ fontSize: 13, color: "#b91c1c", fontFamily: "'Inter', sans-serif", margin: "0 0 12px", padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "10px 24px", borderRadius: 8, border: "none",
          background: loading ? "#c0b09a" : "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)",
          color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "'Inter', sans-serif",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Creating..." : "Create Fulfillment"}
      </button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFulfillForm, setShowFulfillForm] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [resending, setResending] = useState(false);

  async function fetchOrder() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}`);
      if (!res.ok) throw new Error("Order not found");
      const data = await res.json() as { order: Order };
      setOrder(data.order);
      setAdminNote(data.order.adminNote ?? "");
    } catch {
      setError("Failed to load order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOrder(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveNote() {
    if (!order) return;
    setSavingNote(true);
    try {
      await fetch(`/api/admin/orders/${order.id}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote }),
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } finally {
      setSavingNote(false);
    }
  }

  async function handleCancel() {
    if (!order || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setActionMsg(data.error ?? "Failed to cancel order");
        return;
      }
      setShowCancelDialog(false);
      setCancelReason("");
      fetchOrder();
    } finally {
      setCancelling(false);
    }
  }

  async function handleResendEmail() {
    if (!order) return;
    setResending(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/resend-email`, { method: "POST" });
      if (res.ok) {
        setActionMsg("Confirmation email resent successfully.");
      } else {
        setActionMsg("Failed to send email.");
      }
    } finally {
      setResending(false);
      setTimeout(() => setActionMsg(""), 3000);
    }
  }

  function handlePrint() {
    window.print();
  }

  const btnBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 16px", borderRadius: 8, fontSize: 13,
    fontWeight: 500, fontFamily: "'Inter', sans-serif", cursor: "pointer",
    border: "1px solid #e0d5c5", background: "#fff", color: "#3a2e24",
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 15, color: "#b91c1c", fontFamily: "'Inter', sans-serif" }}>{error || "Order not found."}</p>
        <a href="/admin/orders" style={{ fontSize: 14, color: "#8B6914", textDecoration: "none", fontFamily: "'Inter', sans-serif" }}>← Back to Orders</a>
      </div>
    );
  }

  const addr = order.shippingAddress;
  const hasUnfulfilled = order.items.some(i => i.fulfillmentStatus !== "fulfilled");

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        @media (max-width: 767px) {
          .order-detail-grid { grid-template-columns: 1fr !important; }
          .order-action-bar { flex-direction: column !important; align-items: flex-start !important; }
        }
      `}</style>

      {/* Back link */}
      <div className="no-print" style={{ marginBottom: 20 }}>
        <a href="/admin/orders" style={{ fontSize: 13, color: "#8B6914", textDecoration: "none", fontFamily: "'Inter', sans-serif", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Orders
        </a>
      </div>

      {/* Page header */}
      <div className="order-action-bar" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: "#3a2e24", margin: 0 }}>
              Order #{order.orderNumber}
            </h1>
            <StatusBadge status={order.status} />
            <FinancialBadge status={order.financialStatus} />
          </div>
          <p style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", margin: "6px 0 0" }}>
            Placed {formatDate(order.createdAt)}
          </p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleResendEmail}
            disabled={resending}
            style={{ ...btnBase, opacity: resending ? 0.6 : 1 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            {resending ? "Sending..." : "Resend Email"}
          </button>
          <button
            onClick={handlePrint}
            style={btnBase}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
            Print Packing Slip
          </button>
        </div>
      </div>

      {actionMsg && (
        <div style={{ padding: "10px 16px", background: "#f0faf0", border: "1px solid #86efac", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#15803d", fontFamily: "'Inter', sans-serif" }}>
          {actionMsg}
        </div>
      )}

      <div className="order-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

        {/* LEFT COLUMN */}
        <div>

          {/* Order Header Card */}
          <Card title="Order Details">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { label: "Order Number", value: order.orderNumber },
                { label: "Date Placed", value: formatDate(order.createdAt) },
                { label: "Customer Email", value: order.email },
                { label: "Phone", value: order.phone ?? "—" },
                ...(order.discountCode ? [{ label: "Discount Code", value: order.discountCode }] : []),
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 14, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>{value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Timeline */}
          <Card title="Order Timeline">
            <OrderTimeline order={order} />
            {order.cancelledAt && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                <p style={{ margin: 0, fontSize: 13, color: "#b91c1c", fontFamily: "'Inter', sans-serif" }}>
                  <strong>Cancelled</strong> on {formatDateOnly(order.cancelledAt)}
                  {order.cancelReason && `: ${order.cancelReason}`}
                </p>
              </div>
            )}
          </Card>

          {/* Line Items */}
          <Card title="Line Items">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #ede8df" }}>
                    {["Product", "SKU", "Qty", "Unit Price", "Total"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: h === "Product" ? "left" : "right", fontSize: 11, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => {
                    const snap = item.productSnapshot as Record<string, unknown>;
                    const img = snap?.image as string | undefined;
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                        <td style={{ padding: "12px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {img
                              ? <img src={img} alt={item.title} width={40} height={40} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid #ede8df", flexShrink: 0 }} />
                              : <div style={{ width: 40, height: 40, background: "#f5f0e8", borderRadius: 6, border: "1px solid #ede8df", flexShrink: 0 }} />
                            }
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>{item.title}</p>
                              {item.variantTitle && <p style={{ margin: 0, fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>{item.variantTitle}</p>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>{item.sku ?? "—"}</td>
                        <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>{item.quantity}</td>
                        <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap" }}>{formatPrice(item.price)}</td>
                        <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 13, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap" }}>{formatPrice(item.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ borderTop: "1px solid #ede8df", marginTop: 8, paddingTop: 12 }}>
              {[
                { label: "Subtotal", value: order.subtotal },
                ...(order.discountTotal > 0 ? [{ label: "Discount", value: -order.discountTotal, color: "#15803d" }] : []),
                { label: "Shipping", value: order.shippingTotal },
                { label: "Tax", value: order.taxTotal },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px" }}>
                  <span style={{ fontSize: 13, color: "#7a6852", fontFamily: "'Inter', sans-serif" }}>{label}</span>
                  <span style={{ fontSize: 13, color: (color as string) ?? "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                    {value < 0 ? `−${formatPrice(Math.abs(value))}` : value === 0 && label === "Shipping" ? "Free" : formatPrice(value)}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 10px 4px", borderTop: "2px solid #8B6914", marginTop: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>Total</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#8B6914", fontFamily: "'Inter', sans-serif" }}>{formatPrice(order.total)}</span>
              </div>
            </div>
          </Card>

          {/* Fulfillment */}
          <Card title="Fulfillment">
            {order.fulfillments.length > 0 ? (
              <div>
                {order.fulfillments.map((f) => (
                  <div key={f.id} style={{ padding: "14px 16px", background: "#faf7f2", borderRadius: 8, border: "1px solid #ede8df", marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                        {f.trackingCompany ?? "Shipment"}
                      </span>
                      <span style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>{f.shippedAt ? formatDate(f.shippedAt) : ""}</span>
                    </div>
                    {f.trackingNumber && (
                      <p style={{ margin: "0 0 6px", fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                        Tracking: <strong>{f.trackingNumber}</strong>
                      </p>
                    )}
                    {f.estimatedDelivery && (
                      <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>
                        Est. delivery: {formatDateOnly(f.estimatedDelivery)}
                      </p>
                    )}
                    {f.trackingUrl && (
                      <a href={f.trackingUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 13, color: "#8B6914", textDecoration: "none", fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                        Track Package →
                      </a>
                    )}
                  </div>
                ))}
                {hasUnfulfilled && !showFulfillForm && (
                  <button
                    onClick={() => setShowFulfillForm(true)}
                    style={{ ...btnBase, marginTop: 8 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
                  >
                    + Fulfill Remaining Items
                  </button>
                )}
                {showFulfillForm && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #ede8df" }}>
                    <FulfillmentForm order={order} onFulfilled={() => { setShowFulfillForm(false); fetchOrder(); }} />
                  </div>
                )}
              </div>
            ) : order.status === "CANCELLED" ? (
              <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter', sans-serif", margin: 0 }}>Order was cancelled.</p>
            ) : !showFulfillForm ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter', sans-serif", margin: "0 0 16px" }}>No fulfillments yet.</p>
                <button
                  onClick={() => setShowFulfillForm(true)}
                  style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}
                >
                  Create Fulfillment
                </button>
              </div>
            ) : (
              <FulfillmentForm order={order} onFulfilled={() => { setShowFulfillForm(false); fetchOrder(); }} />
            )}
          </Card>

          {/* Customer Note */}
          {order.customerNote && (
            <Card title="Customer Note">
              <p style={{ margin: 0, fontSize: 14, color: "#3a2e24", fontFamily: "'Inter', sans-serif", lineHeight: 1.6, fontStyle: "italic" }}>
                "{order.customerNote}"
              </p>
            </Card>
          )}

          {/* Admin Note */}
          <Card title="Admin Note">
            <textarea
              value={adminNote}
              onChange={e => setAdminNote(e.target.value)}
              placeholder="Internal notes for this order..."
              rows={4}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#3a2e24", resize: "vertical", outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <button
                onClick={handleSaveNote}
                disabled={savingNote}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: savingNote ? "#c0b09a" : "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif", cursor: savingNote ? "not-allowed" : "pointer" }}
              >
                {savingNote ? "Saving..." : "Save Note"}
              </button>
              {noteSaved && <span style={{ fontSize: 13, color: "#15803d", fontFamily: "'Inter', sans-serif" }}>Saved!</span>}
            </div>
          </Card>

          {/* Danger Zone */}
          {order.status !== "CANCELLED" && order.status !== "REFUNDED" && (
            <div className="no-print" style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #fecaca", background: "#fef2f2" }}>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#b91c1c", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Danger Zone
                </h2>
              </div>
              <div style={{ padding: 20 }}>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>
                  Cancelling this order cannot be undone. If the order is paid via Stripe, the payment intent will be voided.
                </p>
                <button
                  onClick={() => setShowCancelDialog(true)}
                  style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fff", color: "#b91c1c", fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#fef2f2"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
                >
                  Cancel Order
                </button>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN */}
        <div>

          {/* Customer Info */}
          <Card title="Customer">
            {order.customer ? (
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                  {order.customer.firstName} {order.customer.lastName}
                </p>
                <p style={{ margin: "0 0 4px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>{order.customer.email}</p>
                {order.customer.phone && <p style={{ margin: 0, fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>{order.customer.phone}</p>}
              </div>
            ) : (
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 14, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>{order.email}</p>
                {order.phone && <p style={{ margin: 0, fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>{order.phone}</p>}
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif", fontStyle: "italic" }}>Guest checkout</p>
              </div>
            )}
          </Card>

          {/* Shipping Address */}
          <Card title="Shipping Address">
            <p style={{ margin: 0, fontSize: 14, color: "#3a2e24", fontFamily: "'Inter', sans-serif", lineHeight: 1.7 }}>
              {addr.firstName} {addr.lastName}<br />
              {addr.address1}<br />
              {addr.address2 && <>{addr.address2}<br /></>}
              {addr.city}, {addr.state} {addr.zip}<br />
              {addr.country}
            </p>
          </Card>

        </div>
      </div>

      {/* Cancel Dialog */}
      {showCancelDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 440, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#3a2e24", fontFamily: "'Cormorant Garamond', serif" }}>
              Cancel Order
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>
              Please provide a reason for cancellation. This cannot be undone.
            </p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation..."
              rows={4}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#3a2e24", resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 16 }}
            />
            {actionMsg && (
              <p style={{ fontSize: 13, color: "#b91c1c", fontFamily: "'Inter', sans-serif", margin: "0 0 12px" }}>{actionMsg}</p>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowCancelDialog(false); setCancelReason(""); setActionMsg(""); }}
                style={{ ...btnBase }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
              >
                Keep Order
              </button>
              <button
                onClick={handleCancel}
                disabled={!cancelReason.trim() || cancelling}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: !cancelReason.trim() || cancelling ? "#fca5a5" : "#b91c1c", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif", cursor: !cancelReason.trim() || cancelling ? "not-allowed" : "pointer" }}
              >
                {cancelling ? "Cancelling..." : "Cancel Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
