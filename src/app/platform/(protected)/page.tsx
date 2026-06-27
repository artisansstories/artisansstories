"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Operator dashboard (P10) — at-a-glance platform health. Fetches the tenant
 * list from /api/platform/tenants (operator-cookie protected) and derives:
 * total tenants, # Stripe-onboarded, total products, and the most recent
 * onboards. Read-only; tenant actions live under /platform/tenants.
 */

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  stripeOnboarded: boolean;
  productCount: number;
  createdAt: string;
}

const ACCENT = "#3D4F7C";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 20,
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={card}>
      <p style={{ fontSize: 12, color: "#7a8296", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 700, color: "#222b40" }}>{value}</p>
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/tenants");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      setTenants(body.tenants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const total = tenants.length;
  const onboarded = tenants.filter((t) => t.stripeOnboarded).length;
  const products = tenants.reduce((sum, t) => sum + (t.productCount ?? 0), 0);
  const recent = [...tenants]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

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
        <Stat label="Tenants" value={loading ? "…" : total} />
        <Stat label="Stripe onboarded" value={loading ? "…" : `${onboarded} / ${total}`} />
        <Stat label="Total products" value={loading ? "…" : products} />
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#222b40" }}>Recent tenants</h2>
          <a href="/platform/tenants" style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>Manage tenants →</a>
        </div>
        {loading ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : recent.length === 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>
                      <a href={`/platform/tenants/${t.id}`} style={{ color: "#222b40", textDecoration: "none" }}>{t.name}</a>
                    </td>
                    <td style={{ padding: "10px 8px", color: "#666" }}>{t.slug}</td>
                    <td style={{ padding: "10px 8px" }}>{t.status}</td>
                    <td style={{ padding: "10px 8px" }}>{t.stripeOnboarded ? "✓ onboarded" : "—"}</td>
                    <td style={{ padding: "10px 8px" }}>{t.productCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
