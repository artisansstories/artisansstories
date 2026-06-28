"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Operator dashboard (P10 · A6) — at-a-glance platform health. Reads the
 * server-side roll-up from /api/platform/dashboard (operator-cookie protected):
 * tenant/active/onboarded counts, total paid revenue + orders, a "needs go-live"
 * list, and the most recent onboards. Read-only; actions live under /platform/tenants.
 */

interface DashboardData {
  counts: { tenants: number; active: number; stripeOnboarded: number; totalProducts: number };
  revenue: { totalPaidRevenueCents: number; totalOrders: number; paidOrders: number };
  needsAttention: { id: string; slug: string; name: string; productCount: number }[];
  recent: {
    id: string;
    slug: string;
    name: string;
    status: string;
    stripeOnboarded: boolean;
    storeEnabled: boolean;
    productCount: number;
    createdAt: string;
  }[];
}

const ACCENT = "#3D4F7C";
const AMBER = "#9a6a12";

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

/** Format a CENTS integer as USD, e.g. 123456 → "$1,234.56". */
function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100,
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={card}>
      <p style={{ fontSize: 12, color: "#7a8296", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 700, color: "#222b40" }}>{value}</p>
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dash = (v: string | number) => (loading || !data ? "…" : v);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Dashboard</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 24 }}>Platform health across all stores.</p>

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <Stat label="Tenants" value={dash(data ? `${data.counts.active} / ${data.counts.tenants}` : "")} />
        <Stat label="Paid revenue" value={dash(data ? fmtCents(data.revenue.totalPaidRevenueCents) : "")} />
        <Stat label="Orders" value={dash(data ? data.revenue.totalOrders : "")} />
        <Stat label="Stripe onboarded" value={dash(data ? `${data.counts.stripeOnboarded} / ${data.counts.tenants}` : "")} />
        <Stat label="Total products" value={dash(data ? data.counts.totalProducts : "")} />
      </div>

      {/* Needs go-live — ACTIVE stores with products but storefront still off. */}
      {data && data.needsAttention.length > 0 && (
        <div style={{ ...card, marginBottom: 24, borderColor: "rgba(154,106,18,0.35)", background: "rgba(154,106,18,0.05)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: AMBER, marginBottom: 4 }}>
            Needs go-live · {data.needsAttention.length}
          </h2>
          <p style={{ color: "#7a8296", fontSize: 13, marginBottom: 12 }}>
            Active stores with products that aren&apos;t live yet.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.needsAttention.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <a href={`/platform/tenants/${t.id}`} style={{ color: "#222b40", fontWeight: 600, textDecoration: "none" }}>
                  {t.name} <span style={{ color: "#8a93a6", fontWeight: 400 }}>· {t.productCount} product{t.productCount === 1 ? "" : "s"}</span>
                </a>
                <a href={`/t/${t.slug}`} target="_blank" rel="noopener" style={{ ...linkBtn, color: AMBER, borderColor: "rgba(154,106,18,0.4)" }}>
                  Preview ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#222b40" }}>Recent tenants</h2>
          <a href="/platform/tenants" style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>Manage tenants →</a>
        </div>
        {loading ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : !data || data.recent.length === 0 ? (
          <p style={{ color: "#888" }}>No tenants yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                  <th style={{ padding: "8px 8px" }}>Name</th>
                  <th style={{ padding: "8px 8px" }}>Slug</th>
                  <th style={{ padding: "8px 8px" }}>Status</th>
                  <th style={{ padding: "8px 8px" }}>Stripe</th>
                  <th style={{ padding: "8px 8px" }}>Products</th>
                  <th style={{ padding: "8px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>
                      <a href={`/platform/tenants/${t.id}`} style={{ color: "#222b40", textDecoration: "none" }}>{t.name}</a>
                    </td>
                    <td style={{ padding: "10px 8px", color: "#666" }}>{t.slug}</td>
                    <td style={{ padding: "10px 8px" }}>{t.status}</td>
                    <td style={{ padding: "10px 8px" }}>{t.stripeOnboarded ? "✓ onboarded" : "—"}</td>
                    <td style={{ padding: "10px 8px" }}>{t.productCount}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <a
                        href={`/t/${t.slug}`}
                        target="_blank"
                        rel="noopener"
                        style={{ ...linkBtn, color: t.storeEnabled && t.status === "ACTIVE" ? ACCENT : AMBER, borderColor: t.storeEnabled && t.status === "ACTIVE" ? "rgba(61,79,124,0.35)" : "rgba(154,106,18,0.4)" }}
                      >
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

      <style>{`a:hover { text-decoration: underline !important; }`}</style>
    </div>
  );
}
