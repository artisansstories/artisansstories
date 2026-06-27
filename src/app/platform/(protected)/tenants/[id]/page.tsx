"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Tenant detail (P10) — operator view of a single tenant: theme summary, Stripe
 * onboarding flags, API-key inventory, and an audited "Impersonate" action.
 * Reads /api/platform/tenants/[id] and /api/platform/tenants/[id]/api-keys.
 */

interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  status: string;
  isPlatformOwner?: boolean;
  platformFeeBps: number;
  checkoutMode: string;
  stripe: { connected: boolean; accountId: string | null; onboarded: boolean };
  theme: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontHeading?: string;
    fontBody?: string;
    radius?: string;
  } | null;
  apiKeyCount: number;
  activeApiKeyCount: number;
  productCount: number;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const ACCENT = "#3D4F7C";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};

const btn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer",
  background: ACCENT, color: "#fff", fontWeight: 600, fontSize: 14,
};

function startImpersonation(tenantId: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `/api/platform/tenants/${tenantId}/impersonate`;
  document.body.appendChild(form);
  form.submit();
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
      color: on ? "#1c7c4a" : "#9a3838",
    }}>
      <span>{on ? "✓" : "✗"}</span> {label}
    </span>
  );
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, kRes] = await Promise.all([
        fetch(`/api/platform/tenants/${id}`),
        fetch(`/api/platform/tenants/${id}/api-keys`),
      ]);
      if (!tRes.ok) {
        const body = await tRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${tRes.status}`);
      }
      setTenant(await tRes.json());
      if (kRes.ok) {
        const kBody = await kRes.json();
        setKeys(kBody.keys ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tenant");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <a href="/platform/tenants" style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>← All tenants</a>

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", marginTop: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#888", marginTop: 16 }}>Loading…</p>
      ) : tenant ? (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, margin: "16px 0 24px" }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: "#222b40" }}>{tenant.name}</h1>
              <p style={{ color: "#7a8296", fontSize: 14 }}>
                {tenant.slug} · {tenant.status}
                {tenant.isPlatformOwner ? " · house store" : ""}
              </p>
            </div>
            <button style={btn} onClick={() => startImpersonation(tenant.id)}>Impersonate</button>
          </div>

          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#222b40" }}>Overview</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, fontSize: 14 }}>
              <div><span style={{ color: "#7a8296" }}>Products</span><br />{tenant.productCount}</div>
              <div><span style={{ color: "#7a8296" }}>Platform fee</span><br />{(tenant.platformFeeBps / 100).toFixed(2)}%</div>
              <div><span style={{ color: "#7a8296" }}>Checkout mode</span><br />{tenant.checkoutMode}</div>
              <div><span style={{ color: "#7a8296" }}>Active API keys</span><br />{tenant.activeApiKeyCount} / {tenant.apiKeyCount}</div>
            </div>
          </div>

          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#222b40" }}>Stripe</h2>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <Flag on={tenant.stripe.connected} label="Connected" />
              <Flag on={tenant.stripe.onboarded} label="Onboarded" />
              {tenant.stripe.accountId && (
                <code style={{ fontSize: 12, color: "#666" }}>{tenant.stripe.accountId}</code>
              )}
            </div>
          </div>

          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#222b40" }}>Theme</h2>
            {tenant.theme ? (
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
                {(["primaryColor", "secondaryColor", "accentColor"] as const).map((k) =>
                  tenant.theme?.[k] ? (
                    <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, background: tenant.theme[k], border: "1px solid rgba(0,0,0,0.1)" }} />
                      {k.replace("Color", "")}
                    </span>
                  ) : null,
                )}
                <span style={{ color: "#666" }}>
                  {tenant.theme.fontHeading} / {tenant.theme.fontBody} · radius {tenant.theme.radius}
                </span>
              </div>
            ) : (
              <p style={{ color: "#888", fontSize: 13 }}>Using platform defaults.</p>
            )}
          </div>

          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#222b40" }}>API keys</h2>
            {keys.length === 0 ? (
              <p style={{ color: "#888", fontSize: 13 }}>No keys minted yet. Mint one from the Tenants list.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                      <th style={{ padding: "8px 8px" }}>Name</th>
                      <th style={{ padding: "8px 8px" }}>Prefix</th>
                      <th style={{ padding: "8px 8px" }}>Scopes</th>
                      <th style={{ padding: "8px 8px" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                        <td style={{ padding: "10px 8px", fontWeight: 600 }}>{k.name}</td>
                        <td style={{ padding: "10px 8px" }}><code>{k.prefix}</code></td>
                        <td style={{ padding: "10px 8px", color: "#666" }}>{k.scopes.join(", ")}</td>
                        <td style={{ padding: "10px 8px" }}>{k.revokedAt ? "revoked" : "active"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
      <style>{`a:hover { text-decoration: underline !important; }`}</style>
    </div>
  );
}
