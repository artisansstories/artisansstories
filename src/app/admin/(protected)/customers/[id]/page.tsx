"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import Image from "next/image";

interface Address {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
  type: string;
}

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  variant: {
    name: string;
    product: {
      name: string;
      images: { urlThumb?: string; url: string }[];
    };
  };
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  financialStatus: string;
  total: number;
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  discountTotal: number;
  createdAt: string;
  items: OrderItem[];
}

interface Customer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  acceptsMarketing: boolean;
  totalOrders: number;
  totalSpent: number;
  notes: string | null;
  tags: string[];
  createdAt: string;
  lastOrderAt: string | null;
  addresses: Address[];
  orders: Order[];
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    PENDING:    { bg: "#fffbeb", color: "#d97706", label: "Pending" },
    CONFIRMED:  { bg: "#eff6ff", color: "#2563eb", label: "Confirmed" },
    PROCESSING: { bg: "#f0fdf4", color: "#16a34a", label: "Processing" },
    SHIPPED:    { bg: "#f0f9ff", color: "#0284c7", label: "Shipped" },
    DELIVERED:  { bg: "#dcfce7", color: "#15803d", label: "Delivered" },
    CANCELLED:  { bg: "#fef2f2", color: "#dc2626", label: "Cancelled" },
    PAID:       { bg: "#dcfce7", color: "#15803d", label: "Paid" },
    REFUNDED:   { bg: "#fef2f2", color: "#dc2626", label: "Refunded" },
    PARTIALLY_REFUNDED: { bg: "#fffbeb", color: "#d97706", label: "Partial Refund" },
  };
  const s = map[status] ?? { bg: "#f5f0e8", color: "#8a7060", label: status };
  return (
    <span style={{ padding: "3px 9px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

interface LiveStats {
  totalOrdersAll: number;
  totalOrdersActive: number;
  totalOrdersCancelled: number;
  netSpent: number;
  grossSpent: number;
  refundedAmount: number;
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/customers/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data?.customer) {
          setCustomer(data.customer);
          setNotes(data.customer.notes ?? "");
        }
        if (data?.liveStats) setLiveStats(data.liveStats);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  async function saveNotes() {
    if (!customer) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        setCustomer((prev) => prev ? { ...prev, notes } : prev);
        setEditingNotes(false);
      }
    } finally {
      setSavingNotes(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (notFound || !customer) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, color: "#9a876e", margin: "0 0 16px" }}>Customer not found</p>
        <Link href="/admin/customers" style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#8B6914", textDecoration: "none" }}>← Back to Customers</Link>
      </div>
    );
  }

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email;
  const initials = (customer.firstName?.[0] ?? customer.email[0]).toUpperCase();

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/customers" style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#8B6914", textDecoration: "none" }}>
          ← Customers
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color: "#fff", fontSize: 22, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{initials}</span>
        </div>
        <div>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 600, color: "#3a2e24", margin: "0 0 4px" }}>{name}</h1>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>
            {customer.email}
            {customer.phone && <> · {customer.phone}</>}
            {" · "}Customer since {fmtDate(customer.createdAt)}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        {/* Active Orders */}
        <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px" }}>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Active Orders</p>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, color: "#3a2e24", margin: "0 0 4px" }}>
            {liveStats ? liveStats.totalOrdersActive : "—"}
          </p>
          {liveStats && liveStats.totalOrdersCancelled > 0 && (
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#dc2626", margin: 0 }}>
              {liveStats.totalOrdersCancelled} cancelled/refunded
            </p>
          )}
        </div>

        {/* Net Spent */}
        <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px" }}>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Net Spent</p>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, color: "#3a2e24", margin: "0 0 4px" }}>
            {liveStats ? fmtMoney(liveStats.netSpent) : "—"}
          </p>
          {liveStats && liveStats.refundedAmount > 0 && (
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#dc2626", margin: 0 }}>
              {fmtMoney(liveStats.refundedAmount)} refunded
            </p>
          )}
        </div>

        {/* Last Order */}
        <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px" }}>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Last Order</p>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, color: "#3a2e24", margin: 0 }}>
            {fmtDate(customer.lastOrderAt)}
          </p>
        </div>

        {/* Marketing */}
        <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px" }}>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Marketing</p>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, color: customer.acceptsMarketing ? "#15803d" : "#6b7280", margin: 0 }}>
            {customer.acceptsMarketing ? "Opted in" : "Opted out"}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
        {/* Left — Orders */}
        <div>
          <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #ede8df" }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 600, color: "#3a2e24", margin: 0 }}>
                Order History ({customer.orders.length})
              </h2>
            </div>

            {customer.orders.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>No orders yet</p>
              </div>
            ) : (
              customer.orders.map((order, idx) => (
                <div key={order.id} style={{ padding: "16px 20px", borderBottom: idx < customer.orders.length - 1 ? "1px solid #f5f0e8" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Link href={`/admin/orders/${order.id}`} style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, color: "#8B6914", textDecoration: "none" }}>
                        {order.orderNumber}
                      </Link>
                      <StatusPill status={order.status} />
                      <StatusPill status={order.financialStatus} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e" }}>{fmtDate(order.createdAt)}</span>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, color: "#3a2e24" }}>{fmtMoney(order.total)}</span>
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {order.items.map((item) => {
                      const thumb = item.variant.product.images[0]?.urlThumb ?? item.variant.product.images[0]?.url;
                      return (
                        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {thumb ? (
                            <Image src={thumb} alt={item.variant.product.name} width={36} height={36} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: "1px solid #ede8df", flexShrink: 0 }} unoptimized />
                          ) : (
                            <div style={{ width: 36, height: 36, borderRadius: 6, background: "#f5f0e8", border: "1px solid #ede8df", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ fontSize: 14 }}>📦</span>
                            </div>
                          )}
                          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5a4a38", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.variant.product.name} — {item.variant.name}
                          </span>
                          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e", flexShrink: 0 }}>
                            ×{item.quantity} · {fmtMoney(item.price * item.quantity)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right — Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Contact */}
          <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px" }}>
            <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 17, fontWeight: 600, color: "#3a2e24", margin: "0 0 12px" }}>Contact</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5a4a38", margin: 0 }}>
                <span style={{ color: "#9a876e" }}>Email: </span>{customer.email}
              </p>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5a4a38", margin: 0 }}>
                <span style={{ color: "#9a876e" }}>Phone: </span>{customer.phone ?? "—"}
              </p>
            </div>
          </div>

          {/* Addresses */}
          {customer.addresses.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px" }}>
              <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 17, fontWeight: 600, color: "#3a2e24", margin: "0 0 12px" }}>
                Addresses ({customer.addresses.length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {customer.addresses.map((addr) => (
                  <div key={addr.id} style={{ paddingBottom: 12, borderBottom: "1px solid #f5f0e8" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.04em" }}>{addr.type}</span>
                      {addr.isDefault && <span style={{ padding: "1px 7px", borderRadius: 10, background: "#f0fdf4", color: "#16a34a", fontSize: 10, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>Default</span>}
                    </div>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#3a2e24", margin: "0 0 2px", fontWeight: 500 }}>
                      {addr.firstName} {addr.lastName}
                    </p>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#5a4a38", margin: 0, lineHeight: 1.5 }}>
                      {addr.address1}{addr.address2 ? `, ${addr.address2}` : ""}<br />
                      {addr.city}, {addr.state} {addr.zip}<br />
                      {addr.country}
                    </p>
                    {addr.phone && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e", margin: "4px 0 0" }}>{addr.phone}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 17, fontWeight: 600, color: "#3a2e24", margin: 0 }}>Notes</h3>
              {!editingNotes && (
                <button onClick={() => setEditingNotes(true)} style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#8B6914", fontWeight: 500, padding: 0 }}>
                  Edit
                </button>
              )}
            </div>
            {editingNotes ? (
              <div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Add internal notes about this customer…"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e0d5c5", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#3a2e24", background: "#fefcf9", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={saveNotes} disabled={savingNotes} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    {savingNotes ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => { setEditingNotes(false); setNotes(customer.notes ?? ""); }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: "pointer", color: "#5a4a38" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: customer.notes ? "#3a2e24" : "#c4b5a0", margin: 0, lineHeight: 1.6 }}>
                {customer.notes || "No notes yet"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
