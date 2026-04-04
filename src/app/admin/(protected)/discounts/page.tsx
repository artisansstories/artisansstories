"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";

interface Discount {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  minimumOrderAmount: number | null;
  appliesToAll: boolean;
  productIds: string[];
  categoryIds: string[];
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(discount: Discount): string {
  if (discount.type === "PERCENTAGE") return `${discount.value}% off`;
  if (discount.type === "FIXED_AMOUNT") return `$${(discount.value / 100).toFixed(2)} off`;
  return "Free shipping";
}

function formatUsage(discount: Discount): string {
  const limit = discount.usageLimit;
  if (limit == null) return `${discount.usageCount}/∞ uses`;
  return `${discount.usageCount}/${limit} uses`;
}

function formatExpiry(discount: Discount): string {
  if (!discount.endsAt) return "—";
  const d = new Date(discount.endsAt);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type StatusKey = "active" | "inactive" | "expired";

function getDiscountStatus(discount: Discount): StatusKey {
  if (discount.endsAt && new Date(discount.endsAt) < new Date()) return "expired";
  if (!discount.isActive) return "inactive";
  return "active";
}

const STATUS_COLORS: Record<StatusKey, { bg: string; text: string }> = {
  active:   { bg: "#dcfce7", text: "#16a34a" },
  inactive: { bg: "#f3f0eb", text: "#9a876e" },
  expired:  { bg: "#fee2e2", text: "#dc2626" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DiscountsPage() {
  const router = useRouter();

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchDiscounts = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/discounts?page=${p}&limit=20`);
      const data = await res.json() as { discounts: Discount[]; total: number; page: number; totalPages: number };
      setDiscounts(data.discounts ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      showToast("Failed to load discounts", true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDiscounts(1); }, [fetchDiscounts]);

  async function handleToggle(discount: Discount) {
    setTogglingId(discount.id);
    try {
      const res = await fetch(`/api/admin/discounts/${discount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !discount.isActive }),
      });
      if (!res.ok) throw new Error();
      setDiscounts(prev => prev.map(d => d.id === discount.id ? { ...d, isActive: !d.isActive } : d));
      showToast(discount.isActive ? "Discount deactivated" : "Discount activated");
    } catch {
      showToast("Failed to update discount", true);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/discounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setConfirmDelete(null);
      showToast("Discount deleted");
      fetchDiscounts(page);
    } catch {
      showToast("Failed to delete discount", true);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", maxWidth: 1100 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.error ? "#fee2e2" : "#dcfce7",
          color: toast.error ? "#b91c1c" : "#15803d",
          border: `1px solid ${toast.error ? "#fca5a5" : "#86efac"}`,
          borderRadius: 10, padding: "12px 18px", fontSize: 14, fontWeight: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 380, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <h3 style={{ fontSize: 17, fontWeight: 600, color: "#3a2e24", margin: "0 0 10px" }}>Delete discount?</h3>
            <p style={{ fontSize: 14, color: "#6b5540", margin: "0 0 22px" }}>This action cannot be undone.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #ede8df", background: "#fff", color: "#5a4a38", fontSize: 14, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#3a2e24", fontFamily: "'Cormorant Garamond',serif", margin: 0 }}>Discount Codes</h1>
          <p style={{ fontSize: 13, color: "#9a876e", margin: "4px 0 0" }}>{total} code{total !== 1 ? "s" : ""} total</p>
        </div>
        <button
          onClick={() => router.push("/admin/discounts/new")}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: "#8B6914", color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "'Inter',sans-serif",
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          Create Discount
        </button>
      </div>

      {/* Desktop Table */}
      <div className="discounts-table-wrapper" style={{ background: "#fff", borderRadius: 14, border: "1px solid #ede8df", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ede8df" }}>
              {["Code", "Type", "Value", "Usage", "Status", "Expiry", "Actions"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f5f0e8" }}>
                  {[120, 90, 80, 80, 70, 90, 80].map((w, j) => (
                    <td key={j} style={{ padding: "14px 16px" }}>
                      <div style={{ height: 14, width: w, background: "#f0ebe3", borderRadius: 6 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : discounts.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "56px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏷️</div>
                  <p style={{ fontSize: 15, color: "#9a876e", margin: 0 }}>No discount codes yet. Create your first one.</p>
                </td>
              </tr>
            ) : (
              discounts.map((d) => {
                const status = getDiscountStatus(d);
                const sc = STATUS_COLORS[status];
                return (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f5f0e8" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: "#3a2e24", letterSpacing: "0.04em" }}>
                        {d.code}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b5540" }}>
                      {d.type === "PERCENTAGE" ? "Percentage" : d.type === "FIXED_AMOUNT" ? "Fixed Amount" : "Free Shipping"}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#3a2e24", fontWeight: 500 }}>
                      {formatValue(d)}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b5540" }}>
                      {formatUsage(d)}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: sc.bg, color: sc.text, textTransform: "capitalize" }}>
                          {status}
                        </span>
                        {status !== "expired" && (
                          <button
                            onClick={() => handleToggle(d)}
                            disabled={togglingId === d.id}
                            title={d.isActive ? "Deactivate" : "Activate"}
                            style={{
                              width: 36, height: 20, borderRadius: 10, border: "none",
                              background: d.isActive ? "#16a34a" : "#d1c5b4",
                              cursor: "pointer", position: "relative", transition: "background 0.2s",
                              flexShrink: 0, opacity: togglingId === d.id ? 0.6 : 1,
                            }}
                          >
                            <span style={{
                              position: "absolute", top: 2, left: d.isActive ? 18 : 2,
                              width: 16, height: 16, borderRadius: "50%", background: "#fff",
                              transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                            }} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b5540" }}>
                      {formatExpiry(d)}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => router.push(`/admin/discounts/${d.id}/edit`)}
                          style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid #ede8df", background: "#fff", color: "#5a4a38", fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 500 }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(d.id)}
                          style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 500 }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="discounts-cards">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: 16, marginBottom: 10 }}>
              <div style={{ height: 16, width: 120, background: "#f0ebe3", borderRadius: 6, marginBottom: 10 }} />
              <div style={{ height: 13, width: 80, background: "#f0ebe3", borderRadius: 6 }} />
            </div>
          ))
        ) : discounts.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: 40, textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "#9a876e", margin: 0 }}>No discount codes yet. Create your first one.</p>
          </div>
        ) : (
          discounts.map((d) => {
            const status = getDiscountStatus(d);
            const sc = STATUS_COLORS[status];
            return (
              <div key={d.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: 16, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: "#3a2e24", letterSpacing: "0.04em" }}>
                    {d.code}
                  </span>
                  <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: sc.bg, color: sc.text, textTransform: "capitalize" }}>
                    {status}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: "#6b5540" }}>
                    {d.type === "PERCENTAGE" ? "Percentage" : d.type === "FIXED_AMOUNT" ? "Fixed Amount" : "Free Shipping"}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24" }}>{formatValue(d)}</span>
                  <span style={{ fontSize: 13, color: "#9a876e" }}>{formatUsage(d)}</span>
                  {d.endsAt && (
                    <span style={{ fontSize: 13, color: "#9a876e" }}>Expires {formatExpiry(d)}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {status !== "expired" && (
                    <button
                      onClick={() => handleToggle(d)}
                      disabled={togglingId === d.id}
                      style={{
                        width: 36, height: 20, borderRadius: 10, border: "none",
                        background: d.isActive ? "#16a34a" : "#d1c5b4",
                        cursor: "pointer", position: "relative", transition: "background 0.2s",
                        flexShrink: 0, opacity: togglingId === d.id ? 0.6 : 1,
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 2, left: d.isActive ? 18 : 2,
                        width: 16, height: 16, borderRadius: "50%", background: "#fff",
                        transition: "left 0.2s",
                      }} />
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/admin/discounts/${d.id}/edit`)}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid #ede8df", background: "#fff", color: "#5a4a38", fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 500 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete(d.id)}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 500 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
          <button
            onClick={() => fetchDiscounts(page - 1)}
            disabled={page <= 1}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ede8df", background: "#fff", color: "#5a4a38", fontSize: 13, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.4 : 1, fontFamily: "'Inter',sans-serif" }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: "#9a876e" }}>Page {page} of {totalPages}</span>
          <button
            onClick={() => fetchDiscounts(page + 1)}
            disabled={page >= totalPages}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ede8df", background: "#fff", color: "#5a4a38", fontSize: 13, cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.4 : 1, fontFamily: "'Inter',sans-serif" }}
          >
            Next
          </button>
        </div>
      )}

      <style>{`
        .discounts-table-wrapper { display: block; }
        .discounts-cards { display: none; }
        @media (max-width: 767px) {
          .discounts-table-wrapper { display: none !important; }
          .discounts-cards { display: block !important; }
        }
      `}</style>
    </div>
  );
}
