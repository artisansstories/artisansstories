"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  stripeOnboarded: boolean;
  storeEnabled: boolean;
  productCount: number;
  createdAt: string;
}

interface DashboardData {
  counts: { tenants: number; active: number; stripeOnboarded: number; totalProducts: number };
  revenue: { totalPaidRevenueCents: number; totalOrders: number; paidOrders: number };
  needsAttention: { id: string; slug: string; name: string; productCount: number }[];
  recent: TenantRow[];
}

type SortKey = "name" | "status" | "stripe" | "products" | "created";
type SortDir = "asc" | "desc";

const ACCENT = "#3D4F7C";
const AMBER = "#9a6a12";
const GREEN = "#1c7c4a";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 20,
};

const linkBtn: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(61,79,124,0.35)",
  cursor: "pointer", background: "transparent", color: ACCENT, fontWeight: 600,
  fontSize: 12, textDecoration: "none", display: "inline-block",
};

export default function PlatformDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStripe, setFilterStripe] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/dashboard");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const tenants = useMemo(() => {
    if (!data) return [];
    let rows = data.recent; // API already returns ALL tenants (not sliced)
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(t => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
    }
    if (filterStatus !== "all") rows = rows.filter(t => t.status === filterStatus);
    if (filterStripe === "onboarded") rows = rows.filter(t => t.stripeOnboarded);
    if (filterStripe === "pending") rows = rows.filter(t => !t.stripeOnboarded);
    return [...rows].sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (sortKey === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortKey === "status") { av = a.status; bv = b.status; }
      else if (sortKey === "stripe") { av = a.stripeOnboarded ? 1 : 0; bv = b.stripeOnboarded ? 1 : 0; }
      else if (sortKey === "products") { av = a.productCount; bv = b.productCount; }
      else if (sortKey === "created") { av = a.createdAt; bv = b.createdAt; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, search, filterStatus, filterStripe, sortKey, sortDir]);

  function SortTh({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => toggleSort(col)}
        style={{ padding: "10px 8px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
          color: active ? ACCENT : "#7a8296", fontWeight: active ? 700 : 500, fontSize: 12,
          textTransform: "uppercase", letterSpacing: "0.04em" }}
      >
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : <span style={{ opacity: 0.3 }}>↕</span>}
      </th>
    );
  }

  const needsAttention = data?.needsAttention ?? [];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#222b40", marginBottom: 2 }}>Tenants</h1>
          <p style={{ color: "#7a8296", fontSize: 14 }}>{loading ? "Loading…" : `${data?.counts.tenants ?? 0} store${data?.counts.tenants === 1 ? "" : "s"}`}</p>
        </div>
        <a href="/platform/tenants" style={{ ...linkBtn, fontSize: 13, padding: "8px 14px" }}>Manage / Create →</a>
      </div>

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", marginBottom: 20 }}>
          {error}
        </div>
      )}

      {needsAttention.length > 0 && (
        <div style={{ ...card, marginBottom: 20, borderColor: "rgba(154,106,18,0.35)", background: "rgba(154,106,18,0.05)", padding: "14px 18px" }}>
          <span style={{ fontWeight: 700, color: AMBER, fontSize: 13 }}>⚠ {needsAttention.length} store{needsAttention.length > 1 ? "s" : ""} ready to go live — </span>
          {needsAttention.map((t, i) => (
            <span key={t.id}>{i > 0 && ", "}<a href={`/platform/tenants/${t.id}`} style={{ color: AMBER, fontWeight: 600 }}>{t.name}</a></span>
          ))}
        </div>
      )}

      {/* Search + filter toolbar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or slug…"
          style={{ flex: "1 1 200px", minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(45,59,85,0.18)", fontSize: 14, outline: "none" }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(45,59,85,0.18)", fontSize: 13, background: "#fff" }}>
          <option value="all">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select value={filterStripe} onChange={e => setFilterStripe(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(45,59,85,0.18)", fontSize: 13, background: "#fff" }}>
          <option value="all">All Stripe</option>
          <option value="onboarded">Stripe onboarded</option>
          <option value="pending">Stripe pending</option>
        </select>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {loading ? (
          <p style={{ color: "#888", padding: 20 }}>Loading…</p>
        ) : tenants.length === 0 ? (
          <p style={{ color: "#888", padding: 20 }}>{data?.recent.length === 0 ? "No tenants yet." : "No tenants match your filters."}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead style={{ background: "#f7f9fc" }}>
                <tr>
                  <SortTh col="name" label="Store" />
                  <th style={{ padding: "10px 8px", color: "#7a8296", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}>Slug</th>
                  <SortTh col="status" label="Status" />
                  <SortTh col="stripe" label="Stripe" />
                  <SortTh col="products" label="Products" />
                  <SortTh col="created" label="Created" />
                  <th style={{ padding: "10px 8px" }} />
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <td style={{ padding: "11px 8px", fontWeight: 600 }}>
                      <a href={`/platform/tenants/${t.id}`} style={{ color: "#222b40", textDecoration: "none" }}>{t.name}</a>
                    </td>
                    <td style={{ padding: "11px 8px", color: "#888", fontSize: 13 }}>{t.slug}</td>
                    <td style={{ padding: "11px 8px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: t.status === "ACTIVE" ? "#ecfdf5" : t.status === "SUSPENDED" ? "#fff7ed" : "#f3f4f6",
                        color: t.status === "ACTIVE" ? GREEN : t.status === "SUSPENDED" ? AMBER : "#666",
                      }}>{t.status}</span>
                    </td>
                    <td style={{ padding: "11px 8px", color: t.stripeOnboarded ? GREEN : "#aaa", fontWeight: t.stripeOnboarded ? 600 : 400, fontSize: 13 }}>
                      {t.stripeOnboarded ? "✓ onboarded" : "—"}
                    </td>
                    <td style={{ padding: "11px 8px", color: "#444" }}>{t.productCount}</td>
                    <td style={{ padding: "11px 8px", color: "#888", fontSize: 12, whiteSpace: "nowrap" }}>
                      {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td style={{ padding: "11px 8px", textAlign: "right", whiteSpace: "nowrap", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <a href={`/platform/tenants/${t.id}`} style={{ ...linkBtn }}>Manage</a>
                      <a href={`/t/${t.slug}`} target="_blank" rel="noopener"
                        style={{ ...linkBtn, color: t.storeEnabled && t.status === "ACTIVE" ? ACCENT : AMBER, borderColor: t.storeEnabled && t.status === "ACTIVE" ? "rgba(61,79,124,0.35)" : "rgba(154,106,18,0.4)" }}>
                        {t.storeEnabled && t.status === "ACTIVE" ? "View ↗" : "Preview ↗"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`a:hover { text-decoration: underline !important; } th { text-align: left; }`}</style>
    </div>
  );
}
