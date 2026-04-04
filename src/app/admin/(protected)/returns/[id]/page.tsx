"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "REFUNDED";
type ReturnReason = "DEFECTIVE" | "WRONG_ITEM" | "NOT_AS_DESCRIBED" | "CHANGED_MIND" | "OTHER";

interface ReturnItem {
  id: string;
  quantity: number;
  reason: ReturnReason;
  note: string | null;
  orderItem: {
    id: string;
    title: string;
    variantTitle: string | null;
    quantity: number;
    price: number;
    total: number;
    variantId: string | null;
  };
}

interface ReturnRecord {
  id: string;
  status: ReturnStatus;
  customerNote: string | null;
  adminNote: string | null;
  refundAmount: number | null;
  restockItems: boolean;
  stripeRefundId: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  items: ReturnItem[];
  order: {
    id: string;
    orderNumber: string;
    email: string;
    total: number;
    stripePaymentIntentId: string | null;
    financialStatus: string;
    customer: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(new Date(dateStr));
}

function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

function reasonLabel(reason: ReturnReason): string {
  const labels: Record<ReturnReason, string> = {
    DEFECTIVE: "Defective",
    WRONG_ITEM: "Wrong item",
    NOT_AS_DESCRIBED: "Not as described",
    CHANGED_MIND: "Changed mind",
    OTHER: "Other",
  };
  return labels[reason];
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
      display: "inline-block", padding: "3px 12px", borderRadius: 100,
      fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif",
      background: s.bg, color: s.color, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #ede8df", background: "#faf7f2" }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: 20 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontFamily: "'Cormorant Garamond', serif", color: "#3a2e24" }}>
          Reject Return
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
          Please provide a reason for rejecting this return request. This will be sent to the customer.
        </p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Enter rejection reason..."
          rows={4}
          style={{
            width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8,
            fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#3a2e24",
            resize: "vertical", outline: "none", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "9px 18px", borderRadius: 8, border: "1px solid #e0d5c5",
              background: "#fff", color: "#3a2e24", fontSize: 13,
              fontFamily: "'Inter', sans-serif", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (reason.trim()) onConfirm(reason.trim()); }}
            disabled={loading || !reason.trim()}
            style={{
              padding: "9px 18px", borderRadius: 8, border: "none",
              background: reason.trim() && !loading ? "#dc2626" : "#f5c6c6",
              color: "#fff", fontSize: 13, fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: reason.trim() && !loading ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "Rejecting..." : "Reject Return"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReturnDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [ret, setRet] = useState<ReturnRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const [showRejectModal, setShowRejectModal] = useState(false);

  // Refund form
  const [refundAmount, setRefundAmount] = useState("");
  const [restock, setRestock] = useState(true);

  // Admin note
  const [adminNote, setAdminNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const fetchReturn = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/returns/${id}`);
      if (!res.ok) throw new Error("Failed to load return");
      const data = await res.json() as { return: ReturnRecord };
      setRet(data.return);
      setAdminNote(data.return.adminNote ?? "");
      // Default refund amount to order total (in dollars)
      if (!refundAmount && data.return.order.total) {
        setRefundAmount((data.return.order.total / 100).toFixed(2));
      }
    } catch {
      setError("Failed to load return. Please try again.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    fetchReturn();
  }, [fetchReturn]);

  async function handleApprove() {
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/returns/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed to approve");
      }
      await fetchReturn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve return");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(reason: string) {
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/returns/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed to reject");
      }
      setShowRejectModal(false);
      await fetchReturn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject return");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReceive() {
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/returns/${id}/receive`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed to mark as received");
      }
      await fetchReturn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to mark as received");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRefund() {
    if (!ret) return;
    const amountCents = Math.round(parseFloat(refundAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      setActionError("Please enter a valid refund amount.");
      return;
    }
    if (amountCents > ret.order.total) {
      setActionError("Refund amount cannot exceed order total.");
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/returns/${id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountCents, restock }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed to issue refund");
      }
      await fetchReturn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to issue refund");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveNote() {
    if (!ret) return;
    setSavingNote(true);
    setNoteSaved(false);
    try {
      const res = await fetch(`/api/admin/returns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 3000);
    } catch {
      // silent
    } finally {
      setSavingNote(false);
    }
  }

  const btnBase: React.CSSProperties = {
    padding: "10px 20px", borderRadius: 8, border: "none",
    fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif",
    cursor: "pointer", transition: "opacity 0.15s",
  };

  if (loading) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <p style={{ fontSize: 15, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>Loading...</p>
      </div>
    );
  }

  if (error || !ret) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <p style={{ fontSize: 15, color: "#dc2626", fontFamily: "'Inter', sans-serif" }}>{error || "Return not found"}</p>
        <a href="/admin/returns" style={{ fontSize: 13, color: "#8B6914", fontFamily: "'Inter', sans-serif" }}>
          Back to Returns
        </a>
      </div>
    );
  }

  return (
    <>
      {showRejectModal && (
        <RejectModal
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
          loading={actionLoading}
        />
      )}

      {/* Back link */}
      <div style={{ marginBottom: 20 }}>
        <a
          href="/admin/returns"
          style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#8B6914"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9a876e"; }}
        >
          ← Back to Returns
        </a>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: "#3a2e24", margin: 0 }}>
          Return #{shortId(ret.id)}
        </h1>
        <StatusBadge status={ret.status} />
      </div>

      {/* Return Summary */}
      <Card title="Return Summary">
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", minWidth: 120 }}>Order</span>
            <a
              href={`/admin/orders/${ret.order.id}`}
              style={{ fontSize: 13, fontWeight: 600, color: "#8B6914", fontFamily: "'Inter', sans-serif", textDecoration: "none" }}
            >
              {ret.order.orderNumber}
            </a>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", minWidth: 120 }}>Customer</span>
            <span style={{ fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
              {ret.order.customer
                ? `${ret.order.customer.firstName ?? ""} ${ret.order.customer.lastName ?? ""}`.trim() || ret.order.email
                : ret.order.email}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", minWidth: 120 }}>Email</span>
            <span style={{ fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>{ret.order.email}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", minWidth: 120 }}>Requested</span>
            <span style={{ fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>{formatDate(ret.requestedAt)}</span>
          </div>
          {ret.resolvedAt && (
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", minWidth: 120 }}>Resolved</span>
              <span style={{ fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>{formatDate(ret.resolvedAt)}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", minWidth: 120 }}>Order Total</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>{formatPrice(ret.order.total)}</span>
          </div>
        </div>
      </Card>

      {/* Items */}
      <Card title="Return Items">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ede8df" }}>
                {["Product", "Variant", "Qty", "Reason", "Note"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ret.items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid #ede8df" }}>
                  <td style={{ padding: "12px 12px", fontSize: 13, fontWeight: 500, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                    {item.orderItem.title}
                  </td>
                  <td style={{ padding: "12px 12px", fontSize: 13, color: "#7a6852", fontFamily: "'Inter', sans-serif" }}>
                    {item.orderItem.variantTitle ?? "—"}
                  </td>
                  <td style={{ padding: "12px 12px", fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                    {item.quantity}
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 6,
                      fontSize: 11, fontWeight: 600, fontFamily: "'Inter', sans-serif",
                      background: "#faf7f2", color: "#8B6914", border: "1px solid #ede8df",
                    }}>
                      {reasonLabel(item.reason)}
                    </span>
                  </td>
                  <td style={{ padding: "12px 12px", fontSize: 13, color: "#7a6852", fontFamily: "'Inter', sans-serif" }}>
                    {item.note ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Customer Note */}
      {ret.customerNote && (
        <Card title="Customer Note">
          <p style={{ margin: 0, fontSize: 14, color: "#3a2e24", fontFamily: "'Inter', sans-serif", lineHeight: 1.6, fontStyle: "italic" }}>
            &ldquo;{ret.customerNote}&rdquo;
          </p>
        </Card>
      )}

      {/* Actions */}
      <Card title="Actions">
        <div style={{ marginBottom: actionError ? 16 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>Current status:</span>
            <StatusBadge status={ret.status} />
          </div>

          {actionError && (
            <div style={{ padding: "10px 14px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#dc2626", fontFamily: "'Inter', sans-serif" }}>{actionError}</p>
            </div>
          )}

          {ret.status === "REQUESTED" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                style={{ ...btnBase, background: actionLoading ? "#93c5fd" : "#3b82f6", color: "#fff" }}
              >
                {actionLoading ? "Processing..." : "Approve Return"}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={actionLoading}
                style={{ ...btnBase, background: "#fff", color: "#dc2626", border: "1px solid #fca5a5" }}
              >
                Reject Return
              </button>
            </div>
          )}

          {ret.status === "APPROVED" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={handleReceive}
                disabled={actionLoading}
                style={{ ...btnBase, background: actionLoading ? "#a5b4fc" : "#6366f1", color: "#fff" }}
              >
                {actionLoading ? "Processing..." : "Mark as Received"}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={actionLoading}
                style={{ ...btnBase, background: "#fff", color: "#dc2626", border: "1px solid #fca5a5" }}
              >
                Reject Return
              </button>
            </div>
          )}

          {ret.status === "RECEIVED" && (
            <div>
              <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                Issue Refund
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#9a876e", fontFamily: "'Inter', sans-serif", marginBottom: 6 }}>
                    Refund Amount (max: {formatPrice(ret.order.total)})
                  </label>
                  <div style={{ display: "flex", alignItems: "center", border: "1px solid #e0d5c5", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                    <span style={{ padding: "0 10px", fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", borderRight: "1px solid #e0d5c5" }}>$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={(ret.order.total / 100).toFixed(2)}
                      value={refundAmount}
                      onChange={e => setRefundAmount(e.target.value)}
                      style={{
                        height: 36, padding: "0 12px", border: "none", outline: "none",
                        fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#3a2e24",
                        width: 120,
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36 }}>
                  <input
                    type="checkbox"
                    id="restock"
                    checked={restock}
                    onChange={e => setRestock(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#8B6914" }}
                  />
                  <label htmlFor="restock" style={{ fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>
                    Restock items
                  </label>
                </div>
                <button
                  onClick={handleRefund}
                  disabled={actionLoading}
                  style={{ ...btnBase, background: actionLoading ? "#86efac" : "#16a34a", color: "#fff" }}
                >
                  {actionLoading ? "Processing..." : "Issue Refund"}
                </button>
              </div>
            </div>
          )}

          {(ret.status === "REJECTED" || ret.status === "REFUNDED") && (
            <div>
              {ret.status === "REJECTED" && ret.adminNote && (
                <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 12 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "#dc2626", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Rejection Reason
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                    {ret.adminNote}
                  </p>
                </div>
              )}
              {ret.status === "REFUNDED" && ret.refundAmount && (
                <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "#15803d", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Refund Issued
                  </p>
                  <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#15803d", fontFamily: "'Inter', sans-serif" }}>
                    {formatPrice(ret.refundAmount)}
                  </p>
                  {ret.stripeRefundId && (
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280", fontFamily: "'Inter', sans-serif" }}>
                      Stripe refund: {ret.stripeRefundId}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Admin Note */}
      <Card title="Admin Note">
        <textarea
          value={adminNote}
          onChange={e => { setAdminNote(e.target.value); setNoteSaved(false); }}
          placeholder="Add an internal note about this return..."
          rows={4}
          style={{
            width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8,
            fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#3a2e24",
            resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 12,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleSaveNote}
            disabled={savingNote}
            style={{
              ...btnBase,
              background: savingNote ? "#d1c4a5" : "#8B6914",
              color: "#fff",
            }}
          >
            {savingNote ? "Saving..." : "Save Note"}
          </button>
          {noteSaved && (
            <span style={{ fontSize: 13, color: "#15803d", fontFamily: "'Inter', sans-serif" }}>
              Note saved!
            </span>
          )}
        </div>
      </Card>
    </>
  );
}
