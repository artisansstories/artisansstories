"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = "PENDING" | "PROCESSING" | "FULFILLED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";
type FinancialStatus = "PENDING" | "PAID" | "PARTIALLY_PAID" | "REFUNDED" | "PARTIALLY_REFUNDED" | "VOIDED";

interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  financialStatus: FinancialStatus;
  email: string;
  total: number;
  itemsCount: number;
  customer: { firstName: string | null; lastName: string | null } | null;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(dateStr));
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
  PENDING:           { bg: "#fef3c7", color: "#b45309" },
  PAID:              { bg: "#dcfce7", color: "#15803d" },
  PARTIALLY_PAID:    { bg: "#ecfdf5", color: "#059669" },
  REFUNDED:          { bg: "#fee2e2", color: "#b91c1c" },
  PARTIALLY_REFUNDED:{ bg: "#fef2f2", color: "#dc2626" },
  VOIDED:            { bg: "#f3f4f6", color: "#6b7280" },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS_STYLES[status];
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 100,
      fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif",
      background: s.bg, color: s.color, whiteSpace: "nowrap",
    }}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function FinancialBadge({ status }: { status: FinancialStatus }) {
  const s = FINANCIAL_STATUS_STYLES[status];
  const label = status.replace(/_/g, " ").charAt(0) + status.replace(/_/g, " ").slice(1).toLowerCase();
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 100,
      fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif",
      background: s.bg, color: s.color, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[100, 160, 180, 90, 110, 80, 60].map((w, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <div style={{ height: 16, width: w, background: "#f0ebe3", borderRadius: 6 }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [financialStatus, setFinancialStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchOrders = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (financialStatus) params.set("financialStatus", financialStatus);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("page", String(pg));
      params.set("limit", "20");

      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch orders");
      const data = await res.json() as { orders: Order[]; total: number; page: number; totalPages: number };
      setOrders(data.orders);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, status, financialStatus, startDate, endDate]);

  useEffect(() => {
    const t = setTimeout(() => fetchOrders(1), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchOrders, search]);

  function handleExportCsv() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (financialStatus) params.set("financialStatus", financialStatus);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("export", "csv");
    window.location.href = `/api/admin/orders?${params.toString()}`;
  }

  const inputStyle: React.CSSProperties = {
    height: 36, padding: "0 12px", border: "1px solid #e0d5c5", borderRadius: 8,
    fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#3a2e24",
    background: "#fff", outline: "none", boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: "pointer", paddingRight: 8,
  };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 767px) {
          .orders-table { display: none !important; }
          .orders-cards { display: block !important; }
          .orders-filter-row { flex-direction: column !important; }
        }
        @media (min-width: 768px) {
          .orders-table { display: table !important; }
          .orders-cards { display: none !important; }
        }
      `}</style>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: "#3a2e24", margin: 0 }}>
            Orders
          </h1>
          <p style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", margin: "4px 0 0" }}>
            {total} order{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 18px", borderRadius: 8,
            border: "1px solid #e0d5c5", background: "#fff",
            color: "#3a2e24", fontSize: 13, fontWeight: 500,
            fontFamily: "'Inter', sans-serif", cursor: "pointer",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
        {/* Search */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search by order # or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, width: "100%", maxWidth: 400 }}
          />
        </div>
        {/* Filter row */}
        <div className="orders-filter-row" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={status} onChange={e => { setStatus(e.target.value); fetchOrders(1); }} style={selectStyle}>
            <option value="">All Statuses</option>
            {(["PENDING","PROCESSING","FULFILLED","SHIPPED","DELIVERED","CANCELLED","REFUNDED"] as OrderStatus[]).map(s => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <select value={financialStatus} onChange={e => { setFinancialStatus(e.target.value); fetchOrders(1); }} style={selectStyle}>
            <option value="">All Financial Statuses</option>
            {(["PENDING","PAID","PARTIALLY_PAID","REFUNDED","PARTIALLY_REFUNDED","VOIDED"] as FinancialStatus[]).map(s => (
              <option key={s} value={s}>{s.replace(/_/g, " ").charAt(0) + s.replace(/_/g, " ").slice(1).toLowerCase()}</option>
            ))}
          </select>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); fetchOrders(1); }} style={inputStyle} placeholder="Start date" />
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); fetchOrders(1); }} style={inputStyle} placeholder="End date" />
          {(search || status || financialStatus || startDate || endDate) && (
            <button
              onClick={() => { setSearch(""); setStatus(""); setFinancialStatus(""); setStartDate(""); setEndDate(""); }}
              style={{ ...inputStyle, border: "1px solid #e0d5c5", cursor: "pointer", background: "#faf7f2", color: "#8B6914", paddingLeft: 14, paddingRight: 14 }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="orders-table" style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ede8df", background: "#faf7f2" }}>
              {["Order #", "Date", "Customer", "Status", "Payment", "Total", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              : orders.length === 0
              ? (
                <tr>
                  <td colSpan={7} style={{ padding: "60px 20px", textAlign: "center" }}>
                    <p style={{ fontSize: 15, color: "#9a876e", fontFamily: "'Inter', sans-serif", margin: 0 }}>No orders yet</p>
                  </td>
                </tr>
              )
              : orders.map((order) => (
                <tr key={order.id} style={{ borderBottom: "1px solid #ede8df" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <td style={{ padding: "14px 16px" }}>
                    <a href={`/admin/orders/${order.id}`} style={{ fontSize: 14, fontWeight: 600, color: "#8B6914", textDecoration: "none", fontFamily: "'Inter', sans-serif" }}>
                      {order.orderNumber}
                    </a>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap" }}>
                    {formatDate(order.createdAt)}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>{order.email}</p>
                    {order.customer?.firstName && (
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
                        {order.customer.firstName} {order.customer.lastName}
                      </p>
                    )}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge status={order.status} />
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <FinancialBadge status={order.financialStatus} />
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap" }}>
                    {formatPrice(order.total)}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <a
                      href={`/admin/orders/${order.id}`}
                      style={{ display: "inline-block", padding: "6px 14px", borderRadius: 7, border: "1px solid #e0d5c5", background: "#fff", color: "#3a2e24", fontSize: 12, fontWeight: 500, fontFamily: "'Inter', sans-serif", textDecoration: "none" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="orders-cards" style={{ display: "none" }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: 16, marginBottom: 10 }}>
                <div style={{ height: 16, width: 120, background: "#f0ebe3", borderRadius: 6, marginBottom: 8 }} />
                <div style={{ height: 14, width: 180, background: "#f0ebe3", borderRadius: 6 }} />
              </div>
            ))
          : orders.length === 0
          ? (
            <div style={{ padding: "60px 20px", textAlign: "center" }}>
              <p style={{ fontSize: 15, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>No orders yet</p>
            </div>
          )
          : orders.map(order => (
            <div key={order.id} style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <a href={`/admin/orders/${order.id}`} style={{ fontSize: 15, fontWeight: 700, color: "#8B6914", textDecoration: "none", fontFamily: "'Inter', sans-serif" }}>
                    {order.orderNumber}
                  </a>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
                    {formatDate(order.createdAt)}
                  </p>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                  {formatPrice(order.total)}
                </span>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>{order.email}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <StatusBadge status={order.status} />
                  <FinancialBadge status={order.financialStatus} />
                </div>
                <a
                  href={`/admin/orders/${order.id}`}
                  style={{ fontSize: 12, fontWeight: 500, color: "#8B6914", textDecoration: "none", fontFamily: "'Inter', sans-serif" }}
                >
                  View →
                </a>
              </div>
            </div>
          ))
        }
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 24 }}>
          <button
            onClick={() => { if (page > 1) fetchOrders(page - 1); }}
            disabled={page <= 1}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid #e0d5c5",
              background: page <= 1 ? "#faf7f2" : "#fff",
              color: page <= 1 ? "#c0b09a" : "#3a2e24",
              fontSize: 13, fontFamily: "'Inter', sans-serif",
              cursor: page <= 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => { if (page < totalPages) fetchOrders(page + 1); }}
            disabled={page >= totalPages}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid #e0d5c5",
              background: page >= totalPages ? "#faf7f2" : "#fff",
              color: page >= totalPages ? "#c0b09a" : "#3a2e24",
              fontSize: 13, fontFamily: "'Inter', sans-serif",
              cursor: page >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
