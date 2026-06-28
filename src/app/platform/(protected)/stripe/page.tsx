"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Stripe overview (A7 / P1-6) — Connect status across all tenants, derived from
 * the tenant list (/api/platform/tenants). Adds a summary count ("N/M onboarded"),
 * an onboarded/not-onboarded filter + name sort, and a per-account link into the
 * Stripe dashboard where a connected account id is present. Per-tenant onboarding
 * actions still live on the tenant detail page; this stays read-only.
 */

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  storeEnabled: boolean;
  stripeOnboarded: boolean;
  stripeConnectAccountId: string | null;
}

const ACCENT = "#3D4F7C";
const GREEN = "#1c7c4a";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 20,
};

const input: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)",
  fontSize: 14,
};

type Filter = "all" | "onboarded" | "not_onboarded";

export default function PlatformStripePage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortAsc, setSortAsc] = useState(true);

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

  useEffect(() => {
    void load();
  }, [load]);

  const onboardedCount = tenants.filter((t) => t.stripeOnboarded).length;

  const rows = useMemo(() => {
    const filtered = tenants.filter((t) =>
      filter === "onboarded" ? t.stripeOnboarded : filter === "not_onboarded" ? !t.stripeOnboarded : true,
    );
    return [...filtered].sort((a, b) =>
      sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    );
  }, [tenants, filter, sortAsc]);

  return (
    <div style={{ maxWidth: 940, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Stripe</h1>
          <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 24 }}>Connect onboarding status across all tenants.</p>
        </div>
        <a
          href="https://dashboard.stripe.com/connect/accounts/overview"
          target="_blank"
          rel="noopener"
          style={{ color: ACCENT, fontWeight: 600, fontSize: 13, textDecoration: "none" }}
        >
          Stripe dashboard ↗
        </a>
      </div>

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", marginBottom: 20 }}>{error}</div>
      )}

      {!loading && tenants.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 15, color: "#222b40" }}>
            <strong style={{ color: GREEN }}>{onboardedCount}</strong>
            <span style={{ color: "#7a8296" }}> / {tenants.length} tenants onboarded</span>
          </p>
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#222b40" }}>Connect accounts</h2>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter by onboarding status"
            style={{ ...input, cursor: "pointer" }}
          >
            <option value="all">All tenants</option>
            <option value="onboarded">Onboarded</option>
            <option value="not_onboarded">Not onboarded</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "#888" }}>{tenants.length === 0 ? "No tenants yet." : "No tenants match this filter."}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                  <th style={{ padding: "8px 8px" }}>
                    <button
                      type="button"
                      onClick={() => setSortAsc((s) => !s)}
                      aria-label={`Sort by tenant name, ${sortAsc ? "ascending" : "descending"}`}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: ACCENT, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      Tenant <span aria-hidden style={{ fontSize: 10 }}>{sortAsc ? "▲" : "▼"}</span>
                    </button>
                  </th>
                  <th style={{ padding: "8px 8px" }}>Onboarded</th>
                  <th style={{ padding: "8px 8px" }}>Account</th>
                  <th style={{ padding: "8px 8px" }}>Store</th>
                  <th style={{ padding: "8px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>{t.name}</td>
                    <td style={{ padding: "10px 8px", color: t.stripeOnboarded ? GREEN : "#9a3838", fontWeight: 600 }}>
                      {t.stripeOnboarded ? "Onboarded" : "Not onboarded"}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {t.stripeConnectAccountId ? (
                        <a
                          href={`https://dashboard.stripe.com/connect/accounts/${t.stripeConnectAccountId}`}
                          target="_blank"
                          rel="noopener"
                          style={{ color: ACCENT, fontWeight: 600, textDecoration: "none", fontSize: 13 }}
                          title="Open this connected account in Stripe"
                        >
                          <code style={{ fontSize: 12 }}>{t.stripeConnectAccountId}</code> ↗
                        </a>
                      ) : (
                        <span style={{ color: "#bbb" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <a
                        href={`/t/${t.slug}`}
                        target="_blank"
                        rel="noopener"
                        style={{ color: t.storeEnabled && t.status === "ACTIVE" ? ACCENT : "#9a6a12", fontWeight: 600, textDecoration: "none", fontSize: 13 }}
                      >
                        {t.storeEnabled && t.status === "ACTIVE" ? "View store ↗" : "Preview ↗"}
                      </a>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right" }}>
                      <a href={`/platform/tenants/${t.id}`} style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}>Details →</a>
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
