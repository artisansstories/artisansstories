"use client";

import { useCallback, useEffect, useState } from "react";
import { MintKeyModal, scopeTitle, type MintTenant } from "../_components/keys";

/**
 * API Keys (A7 / P1-5) — cross-tenant key inventory and management. Reads the
 * roll-up GET /api/platform/api-keys so an operator can review every scoped
 * storefront key in one place, and now mints (via the per-tenant POST) and
 * revokes (per-tenant DELETE) right here without bouncing to each tenant's page.
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

const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  background: ACCENT,
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
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
  const [tenants, setTenants] = useState<MintTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(true);
  const [mintOpen, setMintOpen] = useState(false);
  // Per-row inline revoke confirm + in-flight guard.
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kRes, tRes] = await Promise.all([
        fetch("/api/platform/api-keys"),
        fetch("/api/platform/tenants?includeArchived=1"),
      ]);
      if (!kRes.ok) {
        const body = await kRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${kRes.status}`);
      }
      const body = await kRes.json();
      setKeys(body.keys ?? []);
      setCounts(body.counts ?? null);
      if (tRes.ok) {
        const tBody = await tRes.json();
        setTenants((tBody.tenants ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Soft-revoke via the per-tenant DELETE (the only revoke endpoint). The row
   * carries its tenantId, so we can revoke any key from this cross-tenant view. */
  async function revokeKey(key: KeyRow) {
    if (revokingId) return;
    setRevokingId(key.id);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${key.tenantId}/api-keys/${key.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      setConfirmRevokeId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  }

  const visible = showRevoked ? keys : keys.filter((k) => !k.revokedAt);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>API Keys</h1>
          <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 0 }}>
            Scoped storefront keys across all tenants. Mint and revoke right here.
          </p>
        </div>
        <button style={btn} onClick={() => setMintOpen(true)}>Mint key</button>
      </div>

      {/* What these keys are — plain-English callout so an operator knows the
          blast radius before minting one. */}
      <div
        style={{
          ...card,
          background: "rgba(61,79,124,0.05)",
          borderColor: "rgba(61,79,124,0.2)",
          margin: "16px 0 20px",
          fontSize: 13.5,
          color: "#3a4257",
          lineHeight: 1.55,
        }}
      >
        API keys let external systems (websites, apps, integrations) browse products and create checkouts for a
        tenant&apos;s store. Each key is scoped — <code>store:read</code> lets the app read products/catalog,{" "}
        <code>checkout:create</code> lets it start a Stripe payment. Keys are prefixed with <code>oss_</code> and the
        full key is only shown once at creation.
      </div>

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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 820 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                  <th style={{ padding: "8px 8px" }}>Tenant</th>
                  <th style={{ padding: "8px 8px" }}>Key</th>
                  <th style={{ padding: "8px 8px" }}>Prefix</th>
                  <th style={{ padding: "8px 8px" }}>Scopes</th>
                  <th style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>Created</th>
                  <th style={{ padding: "8px 8px" }}>Status</th>
                  <th style={{ padding: "8px 8px", textAlign: "right" }}>Action</th>
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
                    <td style={{ padding: "10px 8px", color: "#666", cursor: "help" }} title={scopeTitle(k.scopes)}>
                      {k.scopes.join(", ")}
                    </td>
                    <td style={{ padding: "10px 8px", color: "#666", whiteSpace: "nowrap" }}>{fmtDate(k.createdAt)}</td>
                    <td style={{ padding: "10px 8px", color: k.revokedAt ? "#9a3838" : GREEN, fontWeight: 600 }}>
                      {k.revokedAt ? "Revoked" : "Active"}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {k.revokedAt ? (
                        <span style={{ color: "#aab", fontSize: 13 }}>—</span>
                      ) : confirmRevokeId === k.id ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          <span style={{ fontSize: 12, color: "#9a3838" }}>Revoke this key? This cannot be undone.</span>
                          <button
                            onClick={() => void revokeKey(k)}
                            disabled={revokingId === k.id}
                            style={{
                              padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                              background: "#9a3838", color: "#fff", fontWeight: 600, fontSize: 13,
                              opacity: revokingId === k.id ? 0.6 : 1,
                            }}
                          >
                            {revokingId === k.id ? "Revoking…" : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmRevokeId(null)}
                            disabled={revokingId === k.id}
                            style={{
                              padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                              background: "transparent", color: ACCENT, fontWeight: 600, fontSize: 13,
                              border: "1px solid rgba(61,79,124,0.35)",
                            }}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmRevokeId(k.id)}
                          style={{
                            padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                            background: "transparent", color: "#9a3838", fontWeight: 600, fontSize: 13,
                            border: "1px solid rgba(154,56,56,0.4)",
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mintOpen && (
        <MintKeyModal
          tenants={tenants}
          onClose={() => setMintOpen(false)}
          onMinted={() => void load()}
        />
      )}

      <style>{`a:hover { text-decoration: underline !important; }`}</style>
    </div>
  );
}
