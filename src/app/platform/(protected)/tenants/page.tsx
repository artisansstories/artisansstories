"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Operator tenant console (P10) — moved out of the store admin (`/admin/platform`)
 * into the standalone operator app. Lists tenants, creates new ones, mints scoped
 * API keys (shown once), and starts an audited impersonation session into any
 * store's /admin. All endpoints are operator-cookie protected.
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

interface MintedKey {
  id: string;
  name: string;
  token: string;
  prefix: string;
  scopes: string[];
  warning: string;
}

const ALL_SCOPES = ["store:read", "store:write", "checkout:create"] as const;

const ACCENT = "#3D4F7C";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 20,
};

const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 4 };
const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)", fontSize: 14, marginBottom: 12,
};
const btn: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
  background: ACCENT, color: "#fff", fontWeight: 600, fontSize: 14,
};
const btnGhost: React.CSSProperties = {
  ...btn, background: "rgba(61,79,124,0.1)", color: ACCENT,
};

/** POST to the impersonation start endpoint via a real form so the browser
 * follows the server redirect into /admin (and carries the freshly-set cookie). */
function startImpersonation(tenantId: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `/api/platform/tenants/${tenantId}/impersonate`;
  document.body.appendChild(form);
  form.submit();
}

export default function PlatformTenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const [mintFor, setMintFor] = useState<TenantRow | null>(null);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["store:read", "checkout:create"]);
  const [minting, setMinting] = useState(false);
  const [minted, setMinted] = useState<MintedKey | null>(null);

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

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body.errors && body.errors.join(" ")) || body.message || body.error || `HTTP ${res.status}`);
      }
      setName("");
      setSlug("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create tenant");
    } finally {
      setCreating(false);
    }
  }

  async function mintKey(e: React.FormEvent) {
    e.preventDefault();
    if (!mintFor) return;
    setMinting(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${mintFor.id}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName, scopes: keyScopes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body.errors && body.errors.join(" ")) || body.message || body.error || `HTTP ${res.status}`);
      }
      setMinted(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mint key");
    } finally {
      setMinting(false);
    }
  }

  function closeMintModal() {
    setMintFor(null);
    setKeyName("");
    setKeyScopes(["store:read", "checkout:create"]);
    setMinted(null);
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Tenants</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 24 }}>
        Onboard a tenant, mint a scoped API key, or impersonate a store&apos;s admin for support.
      </p>

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* New tenant form */}
      <form onSubmit={createTenant} style={{ ...card, marginBottom: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: "#222b40" }}>New tenant</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={label}>Name</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mike's Pottery" required />
          </div>
          <div>
            <label style={label}>Slug</label>
            <input style={input} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="mikes-pottery" required />
          </div>
        </div>
        <button type="submit" style={{ ...btn, opacity: creating ? 0.6 : 1 }} disabled={creating}>
          {creating ? "Creating…" : "Create tenant"}
        </button>
      </form>

      {/* Tenant list */}
      <div style={card}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: "#222b40" }}>All tenants</h2>
        {loading ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : tenants.length === 0 ? (
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
                {tenants.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>
                      <a href={`/platform/tenants/${t.id}`} style={{ color: "#222b40", textDecoration: "none" }}>{t.name}</a>
                    </td>
                    <td style={{ padding: "10px 8px", color: "#666" }}>{t.slug}</td>
                    <td style={{ padding: "10px 8px" }}>{t.status}</td>
                    <td style={{ padding: "10px 8px" }}>{t.stripeOnboarded ? "✓ onboarded" : "—"}</td>
                    <td style={{ padding: "10px 8px" }}>{t.productCount}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button style={{ ...btnGhost, marginRight: 8 }} onClick={() => setMintFor(t)}>Mint API key</button>
                      <button style={btn} onClick={() => startImpersonation(t.id)}>Impersonate</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mint-key modal */}
      {mintFor && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeMintModal(); }}
        >
          <div style={{ ...card, width: "100%", maxWidth: 480 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Mint API key</h2>
            <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>for <strong>{mintFor.name}</strong></p>

            {minted ? (
              <div>
                <p style={{ fontSize: 13, color: "#a01818", fontWeight: 600, marginBottom: 8 }}>{minted.warning}</p>
                <code style={{ display: "block", padding: 12, background: "#eef1f7", borderRadius: 8, fontSize: 13, wordBreak: "break-all", marginBottom: 12 }}>
                  {minted.token}
                </code>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
                  prefix <code>{minted.prefix}</code> · scopes {minted.scopes.join(", ")}
                </p>
                <button style={btn} onClick={closeMintModal}>Done</button>
              </div>
            ) : (
              <form onSubmit={mintKey}>
                <label style={label}>Key name</label>
                <input style={input} value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Storefront integration" required />
                <label style={label}>Scopes</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {ALL_SCOPES.map((s) => (
                    <label key={s} style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={keyScopes.includes(s)}
                        onChange={(e) =>
                          setKeyScopes((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))
                        }
                      />
                      <code>{s}</code>
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="submit" style={{ ...btn, opacity: minting ? 0.6 : 1 }} disabled={minting || keyScopes.length === 0}>
                    {minting ? "Minting…" : "Mint key"}
                  </button>
                  <button type="button" style={btnGhost} onClick={closeMintModal}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`a:hover { text-decoration: underline !important; }`}</style>
    </div>
  );
}
