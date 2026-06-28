"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Stripe overview (P10, v1) — Connect status across all tenants, derived from the
 * tenant list (/api/platform/tenants). Per-tenant onboarding actions live on the
 * tenant detail page; this is a read-only roll-up.
 */

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  storeEnabled: boolean;
  stripeOnboarded: boolean;
}

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 20,
};

export default function PlatformStripePage() {
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
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Stripe</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 24 }}>Connect onboarding status across all tenants.</p>

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", marginBottom: 20 }}>{error}</div>
      )}

      <div style={card}>
        {loading ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : tenants.length === 0 ? (
          <p style={{ color: "#888" }}>No tenants yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                <th style={{ padding: "8px 8px" }}>Tenant</th>
                <th style={{ padding: "8px 8px" }}>Onboarded</th>
                <th style={{ padding: "8px 8px" }}>Store</th>
                <th style={{ padding: "8px 8px" }}></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <td style={{ padding: "10px 8px", fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: "10px 8px", color: t.stripeOnboarded ? "#1c7c4a" : "#9a3838" }}>
                    {t.stripeOnboarded ? "✓ onboarded" : "— not onboarded"}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <a
                      href={`/t/${t.slug}`}
                      target="_blank"
                      rel="noopener"
                      style={{ color: t.storeEnabled && t.status === "ACTIVE" ? "#3D4F7C" : "#9a6a12", fontWeight: 600, textDecoration: "none", fontSize: 13 }}
                    >
                      {t.storeEnabled && t.status === "ACTIVE" ? "View store ↗" : "Preview ↗"}
                    </a>
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>
                    <a href={`/platform/tenants/${t.id}`} style={{ color: "#3D4F7C", fontWeight: 600, textDecoration: "none" }}>Details →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
