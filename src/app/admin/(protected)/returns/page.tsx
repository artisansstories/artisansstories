"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "REFUNDED";

interface ReturnItem {
  id: string;
  quantity: number;
  orderItem: { title: string; variantTitle: string | null };
}

interface ReturnRecord {
  id: string;
  status: ReturnStatus;
  requestedAt: string;
  items: ReturnItem[];
  order: {
    id: string;
    orderNumber: string;
    email: string;
    total: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(dateStr));
}

function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ReturnStatus, { bg: string; color: string }> = {
  REQUESTED: { bg: "#fef3c7", color: "#b45309" },
  APPROVED:  { bg: "#dbeafe", color: "#1d4ed8" },
  REJECTED:  { bg: "#fee2e2", color: "#dc2626" },
  RECEIVED:  { bg: "#e0e7ff", color: "#4338ca" },
  REFUNDED:  { bg: "#dcfce7", color: "#15803d" },
};

function StatusBadge({ status }: { status: ReturnStatus }) {
  const s = STATUS_STYLES[status];
  const label = status.charAt(0) + status.slice(1).toLowerCase();
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[80, 120, 180, 90, 60, 140, 60].map((w, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <div style={{ height: 16, width: w, background: "#f0ebe3", borderRadius: 6 }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchReturns = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(pg));
      params.set("limit", "20");

      const res = await fetch(`/api/admin/returns?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch returns");
      const data = await res.json() as {
        returns: ReturnRecord[];
        total: number;
        page: number;
        totalPages: number;
      };
      setReturns(data.returns);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchReturns(1);
  }, [fetchReturns]);

  const selectStyle: React.CSSProperties = {
    height: 36, padding: "0 12px", border: "1px solid #e0d5c5", borderRadius: 8,
    fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#3a2e24",
    background: "#fff", outline: "none", cursor: "pointer",
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .returns-table { display: none !important; }
          .returns-cards { display: block !important; }
        }
        @media (min-width: 768px) {
          .returns-table { display: table !important; }
          .returns-cards { display: none !important; }
        }
      `}</style>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: "#3a2e24", margin: 0 }}>
            Returns
          </h1>
          <p style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", margin: "4px 0 0" }}>
            {total} return{total !== 1 ? "s" : ""} total
          </p>
        </div>
      </div>

      {/* Filter row */}
      <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); fetchReturns(1); }}
            style={selectStyle}
          >
            <option value="">All Statuses</option>
            {(["REQUESTED", "APPROVED", "REJECTED", "RECEIVED", "REFUNDED"] as ReturnStatus[]).map(s => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          {statusFilter && (
            <button
              onClick={() => { setStatusFilter(""); fetchReturns(1); }}
              style={{ ...selectStyle, border: "1px solid #e0d5c5", background: "#faf7f2", color: "#8B6914", paddingLeft: 14, paddingRight: 14, cursor: "pointer" }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="returns-table" style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ede8df", background: "#faf7f2" }}>
              {["Return ID", "Order #", "Customer", "Status", "Items", "Requested", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              : returns.length === 0
              ? (
                <tr>
                  <td colSpan={7} style={{ padding: "60px 20px", textAlign: "center" }}>
                    <p style={{ fontSize: 15, color: "#9a876e", fontFamily: "'Inter', sans-serif", margin: 0 }}>No returns yet</p>
                  </td>
                </tr>
              )
              : returns.map((ret) => (
                <tr key={ret.id} style={{ borderBottom: "1px solid #ede8df" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: "#8B6914", fontFamily: "'Inter', sans-serif" }}>
                    {shortId(ret.id)}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <a href={`/admin/orders/${ret.order.id}`} style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", textDecoration: "none", fontFamily: "'Inter', sans-serif" }}>
                      {ret.order.orderNumber}
                    </a>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>
                    {ret.order.email}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge status={ret.status} />
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>
                    {ret.items.length} item{ret.items.length !== 1 ? "s" : ""}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap" }}>
                    {formatDate(ret.requestedAt)}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <a
                      href={`/admin/returns/${ret.id}`}
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
      <div className="returns-cards" style={{ display: "none" }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: 16, marginBottom: 10 }}>
                <div style={{ height: 16, width: 120, background: "#f0ebe3", borderRadius: 6, marginBottom: 8 }} />
                <div style={{ height: 14, width: 180, background: "#f0ebe3", borderRadius: 6 }} />
              </div>
            ))
          : returns.length === 0
          ? (
            <div style={{ padding: "60px 20px", textAlign: "center" }}>
              <p style={{ fontSize: 15, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>No returns yet</p>
            </div>
          )
          : returns.map(ret => (
            <div key={ret.id} style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#8B6914", fontFamily: "'Inter', sans-serif" }}>
                    {shortId(ret.id)}
                  </span>
                  <span style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", marginLeft: 8 }}>
                    — {ret.order.orderNumber}
                  </span>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
                    {formatDate(ret.requestedAt)}
                  </p>
                </div>
                <StatusBadge status={ret.status} />
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>{ret.order.email}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
                  {ret.items.length} item{ret.items.length !== 1 ? "s" : ""}
                </span>
                <a
                  href={`/admin/returns/${ret.id}`}
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
            onClick={() => { if (page > 1) fetchReturns(page - 1); }}
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
            onClick={() => { if (page < totalPages) fetchReturns(page + 1); }}
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
