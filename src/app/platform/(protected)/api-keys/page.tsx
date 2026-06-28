"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * API Keys (A7 / P1-5) — cross-tenant key inventory. Reads the read-only roll-up
 * GET /api/platform/api-keys so an operator can review every scoped storefront
 * key in one place. Minting + revoke stay on each tenant's page (linked per row);
 * revoke-from-here is a deferred nicety.
 */

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
}

interface Counts {
  total: number;
  active: number;
  revoked: number;
}

const ACCENT = "#3D4F7C";
const GREEN = "#1c7c4a";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 20,
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ ...card, flex: "1 1 140px", minWidth: 140 }}>
      <p style={{ fontSize: 12, color: "#7a8296", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 0", color: color ?? "#222b40" }}>{value}</p>
    </div>
  );
}

export default function PlatformApiKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/api-keys");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      setKeys(body.keys ?? []);
      setCounts(body.counts ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = showRevoked ? keys : keys.filter((k) => !k.revokedAt);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>API Keys</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 24 }}>
        Scoped storefront keys across all tenants. Mint and revoke from each tenant&apos;s page.
      </p>

      {error && (
        <div
          style={{
            ...card,
            borderColor: "rgba(200,40,40,0.4)",
            background: "rgba(200,40,40,0.06)",
            color: "#a01818",
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {counts && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <Stat label="Total keys" value={counts.total} />
          <Stat label="Active" value={counts.active} color={GREEN} />
          <Stat label="Revoked" value={counts.revoked} color="#9a3838" />
        </div>
      )}

      <div style={card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#222b40" }}>All keys</h2>
          <label style={{ fontSize: 13, color: "#666", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
            Show revoked
          </label>
        </div>

        {loading ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : visible.length === 0 ? (
          <p style={{ color: "#888" }}>{keys.length === 0 ? "No API keys minted yet." : "No active keys."}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                  <th style={{ padding: "8px 8px" }}>Tenant</th>
                  <th style={{ padding: "8px 8px" }}>Key</th>
                  <th style={{ padding: "8px 8px" }}>Prefix</th>
                  <th style={{ padding: "8px 8px" }}>Scopes</th>
                  <th style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>Created</th>
                  <th style={{ padding: "8px 8px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((k) => (
                  <tr key={k.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)", opacity: k.revokedAt ? 0.6 : 1 }}>
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>
                      <a href={`/platform/tenants/${k.tenantId}`} style={{ color: ACCENT, textDecoration: "none" }}>
                        {k.tenantName}
                      </a>
                    </td>
                    <td style={{ padding: "10px 8px", color: "#444" }}>{k.name}</td>
                    <td style={{ padding: "10px 8px" }}><code>{k.prefix}</code></td>
                    <td style={{ padding: "10px 8px", color: "#666" }}>{k.scopes.join(", ")}</td>
                    <td style={{ padding: "10px 8px", color: "#666", whiteSpace: "nowrap" }}>{fmtDate(k.createdAt)}</td>
                    <td style={{ padding: "10px 8px", color: k.revokedAt ? "#9a3838" : GREEN, fontWeight: 600 }}>
                      {k.revokedAt ? "Revoked" : "Active"}
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
