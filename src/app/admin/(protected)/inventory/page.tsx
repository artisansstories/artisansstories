"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";

interface InventoryItem {
  id: string;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  trackedInventory: boolean;
  variant: {
    id: string;
    name: string;
    sku: string | null;
    product: {
      id: string;
      name: string;
      images: { url: string; urlThumb?: string }[];
    };
  };
}

/* ── Toast ── */
interface Toast {
  id: number;
  message: string;
  kind: "success" | "error";
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, display: "flex", flexDirection: "column", gap: 10, zIndex: 9999, pointerEvents: "none" }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: t.kind === "success" ? "#1a4731" : "#7f1d1d",
          color: "#fff", padding: "12px 18px", borderRadius: 10,
          fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 500,
          boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
          animation: "slideInToast 0.2s ease",
          minWidth: 200,
        }}>
          <span style={{ fontSize: 16 }}>{t.kind === "success" ? "✓" : "✕"}</span>
          {t.message}
        </div>
      ))}
      <style>{`@keyframes slideInToast { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}

function StatusBadge({ qty, threshold }: { qty: number; threshold: number }) {
  let label = "In Stock";
  let bg = "#dcfce7";
  let color = "#15803d";
  if (qty === 0) { label = "Out of Stock"; bg = "#fef2f2"; color = "#dc2626"; }
  else if (qty <= threshold) { label = "Low Stock"; bg = "#fffbeb"; color = "#d97706"; }
  return (
    <span style={{ padding: "4px 10px", borderRadius: 20, background: bg, color, fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function QtyCell({
  item,
  onUpdate,
  onToast,
  savedId,
}: {
  item: InventoryItem;
  onUpdate: (id: string, newQty: number) => void;
  onToast: (msg: string, kind: "success" | "error") => void;
  savedId: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.quantity));
  const [saving, setSaving] = useState(false);
  const justSaved = savedId === item.id;

  async function save() {
    const newQty = parseInt(val, 10);
    if (isNaN(newQty) || newQty < 0) { setEditing(false); setVal(String(item.quantity)); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/inventory/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty }),
      });
      if (res.ok) {
        onUpdate(item.id, newQty);
        setEditing(false);
        onToast(`Saved — ${item.variant.product.name} (${item.variant.name}): ${newQty}`, "success");
      } else {
        onToast("Failed to save. Try again.", "error");
      }
    } catch {
      onToast("Failed to save. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function adjust(delta: number) {
    const newQty = Math.max(0, item.quantity + delta);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/inventory/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      if (res.ok) {
        onUpdate(item.id, newQty);
        setVal(String(newQty));
        onToast(`Saved — ${item.variant.product.name} (${item.variant.name}): ${newQty}`, "success");
      } else {
        onToast("Failed to save. Try again.", "error");
      }
    } catch {
      onToast("Failed to save. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setVal(String(item.quantity)); } }}
          style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: "1px solid #8B6914", fontFamily: "'Inter',sans-serif", fontSize: 14, textAlign: "center" }}
          autoFocus
        />
        <button onClick={save} disabled={saving} style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {saving ? "…" : "Save"}
        </button>
        <button onClick={() => { setEditing(false); setVal(String(item.quantity)); }} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 12, cursor: "pointer", color: "#5a4a38" }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => adjust(-1)} disabled={saving || item.quantity === 0}
        style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #e0d5c5", background: "transparent", cursor: item.quantity === 0 ? "not-allowed" : "pointer", color: "#5a4a38", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", opacity: item.quantity === 0 ? 0.4 : 1 }}>
        −
      </button>
      <span
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          minWidth: 40, textAlign: "center", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600,
          color: justSaved ? "#15803d" : "#3a2e24",
          cursor: "pointer", padding: "4px 6px", borderRadius: 6,
          background: justSaved ? "rgba(21,128,61,0.1)" : "transparent",
          transition: "background 0.15s, color 0.3s",
        }}
        onMouseEnter={(e) => { if (!justSaved) (e.currentTarget as HTMLElement).style.background = "rgba(139,105,20,0.08)"; }}
        onMouseLeave={(e) => { if (!justSaved) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {saving ? "…" : item.quantity}
      </span>
      <button onClick={() => adjust(1)} disabled={saving}
        style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #e0d5c5", background: "transparent", cursor: "pointer", color: "#5a4a38", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
        +
      </button>
    </div>
  );
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");

  /* Toast state */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function addToast(message: string, kind: "success" | "error") {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        ...(search && { search }),
        ...(lowStockOnly && { lowStock: "true" }),
      });
      const res = await fetch(`/api/admin/inventory?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setItems(data.inventory);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, search, lowStockOnly]);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleUpdate(id: string, newQty: number) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, quantity: newQty } : item));
    setLastSavedId(id);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setLastSavedId(null), 2500);
  }

  return (
    <div>
      <ToastContainer toasts={toasts} />
      <style>{`
        @media (max-width: 767px) { .inv-table { display: none !important; } .inv-cards { display: block !important; } }
        @media (min-width: 768px) { .inv-table { display: table !important; } .inv-cards { display: none !important; } }
      `}</style>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: "#3a2e24", margin: "0 0 4px" }}>Inventory</h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>
            {total} variant{total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: 1, minWidth: 240 }}>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by product name or SKU…"
            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #e0d5c5", fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#3a2e24", background: "#fefcf9", outline: "none" }}
          />
          <button type="submit" style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            Search
          </button>
          {search && (
            <button type="button" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 14, cursor: "pointer", color: "#5a4a38" }}>
              Clear
            </button>
          )}
        </form>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#5a4a38", whiteSpace: "nowrap" }}>
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => { setLowStockOnly(e.target.checked); setPage(1); }}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          Low Stock Only
        </label>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : items.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#9a876e", margin: 0 }}>No inventory found</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
            <table className="inv-table" style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ede8df" }}>
                  {["Product", "Variant", "SKU", "Qty", "Threshold", "Status"].map((h) => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const thumb = item.variant.product.images[0]?.urlThumb ?? item.variant.product.images[0]?.url;
                  const rowSaved = lastSavedId === item.id;
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: idx < items.length - 1 ? "1px solid #f5f0e8" : "none",
                        transition: "background 0.2s",
                        background: rowSaved ? "rgba(21,128,61,0.06)" : "transparent",
                      }}
                      onMouseEnter={(e) => { if (!rowSaved) (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                      onMouseLeave={(e) => { if (!rowSaved) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {thumb ? (
                            <Image src={thumb} alt={item.variant.product.name} width={40} height={40} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid #ede8df" }} unoptimized />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 6, background: "#f5f0e8", border: "1px solid #ede8df", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 16 }}>📦</span>
                            </div>
                          )}
                          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#3a2e24", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.variant.product.name}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5a4a38" }}>{item.variant.name}</td>
                      <td style={{ padding: "12px 16px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e", fontVariantNumeric: "tabular-nums" }}>{item.variant.sku ?? "—"}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <QtyCell item={item} onUpdate={handleUpdate} onToast={addToast} savedId={lastSavedId} />
                      </td>
                      <td style={{ padding: "12px 16px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5a4a38" }}>{item.lowStockThreshold}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <StatusBadge qty={item.quantity} threshold={item.lowStockThreshold} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className="inv-cards" style={{ display: "none" }}>
              {items.map((item) => {
                const thumb = item.variant.product.images[0]?.urlThumb ?? item.variant.product.images[0]?.url;
                return (
                  <div key={item.id} style={{ padding: "16px", borderBottom: "1px solid #f5f0e8" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                      {thumb ? (
                        <Image src={thumb} alt={item.variant.product.name} width={48} height={48} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, border: "1px solid #ede8df", flexShrink: 0 }} unoptimized />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 8, background: "#f5f0e8", border: "1px solid #ede8df", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📦</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, color: "#3a2e24", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.variant.product.name}</p>
                        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e", margin: "0 0 4px" }}>{item.variant.name}{item.variant.sku ? ` · ${item.variant.sku}` : ""}</p>
                        <StatusBadge qty={item.quantity} threshold={item.lowStockThreshold} />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e" }}>Threshold: {item.lowStockThreshold}</span>
                      <QtyCell item={item} onUpdate={handleUpdate} onToast={addToast} savedId={lastSavedId} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 14, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1, color: "#5a4a38" }}>
                Previous
              </button>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e" }}>Page {page} of {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 14, cursor: page === pages ? "not-allowed" : "pointer", opacity: page === pages ? 0.5 : 1, color: "#5a4a38" }}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
