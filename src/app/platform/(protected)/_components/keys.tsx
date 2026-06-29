"use client";

import { useState } from "react";
import { Modal } from "./Modal";

/**
 * Shared API-key UI for the operator console: scope metadata (so every page
 * describes a scope the same way) and the mint-key modal used by both the
 * cross-tenant API Keys page and the per-tenant detail page. The raw token is
 * shown exactly ONCE on success with a copy button — it is never persisted in
 * plaintext, so there is no way to re-display it.
 */

const ACCENT = "#3D4F7C";

/** Every scope the mint endpoint accepts, with the plain-English meaning used
 * for the checkbox labels and the Scopes-column hover title across pages. */
export const SCOPE_META: { value: string; label: string; desc: string }[] = [
  { value: "store:read", label: "store:read", desc: "Read products and catalog data for the store." },
  { value: "store:write", label: "store:write", desc: "Create and modify products and catalog data." },
  { value: "checkout:create", label: "checkout:create", desc: "Start a Stripe checkout / payment for the store." },
];

/** Multi-line title text for a Scopes cell, e.g. for a hover tooltip. */
export function scopeTitle(scopes: string[]): string {
  return scopes
    .map((s) => {
      const m = SCOPE_META.find((x) => x.value === s);
      return m ? `${m.value} — ${m.desc}` : s;
    })
    .join("\n");
}

interface MintedKey {
  id: string;
  name: string;
  token: string;
  prefix: string;
  scopes: string[];
  warning: string;
}

export interface MintTenant {
  id: string;
  name: string;
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)",
  fontSize: 14,
  marginBottom: 12,
  boxSizing: "border-box",
};
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 4 };
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
const btnGhost: React.CSSProperties = { ...btn, background: "rgba(61,79,124,0.1)", color: ACCENT };

/**
 * Mint-key modal. When `lockTenant` is set the tenant is fixed (rendered as
 * static text); otherwise the operator picks one from `tenants`. Calls
 * `onMinted` after a successful mint so the parent can refresh its list.
 */
export function MintKeyModal({
  tenants,
  initialTenantId,
  lockTenant = false,
  onClose,
  onMinted,
}: {
  tenants: MintTenant[];
  initialTenantId?: string;
  lockTenant?: boolean;
  onClose: () => void;
  onMinted?: () => void;
}) {
  const [tenantId, setTenantId] = useState(initialTenantId ?? tenants[0]?.id ?? "");
  const [keyName, setKeyName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["store:read", "checkout:create"]);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const lockedTenant = tenants.find((t) => t.id === tenantId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (minting || !tenantId) return;
    setMinting(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim(), scopes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body.errors && body.errors.join(" ")) || body.message || body.error || `HTTP ${res.status}`);
      }
      setMinted(body);
      onMinted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mint key");
    } finally {
      setMinting(false);
    }
  }

  async function copyToken() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context) — leave the token visible to copy by hand.
    }
  }

  return (
    <Modal ariaLabel="Mint API key" onClose={onClose} closeDisabled={minting} maxWidth={480}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        disabled={minting}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          background: "transparent",
          border: "none",
          cursor: minting ? "not-allowed" : "pointer",
          fontSize: 22,
          lineHeight: 1,
          color: "#888",
          padding: 4,
        }}
      >
        ×
      </button>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Mint API key</h2>

      {minted ? (
        <div>
          <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
            for <strong>{lockedTenant?.name ?? "store"}</strong>
          </p>
          <p style={{ fontSize: 13, color: "#a01818", fontWeight: 600, marginBottom: 8 }}>
            Store this now — it will not be shown again.
          </p>
          <code
            style={{
              display: "block",
              padding: 12,
              background: "#eef1f7",
              borderRadius: 8,
              fontSize: 13,
              wordBreak: "break-all",
              marginBottom: 12,
            }}
          >
            {minted.token}
          </code>
          <p style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
            prefix <code>{minted.prefix}</code> · scopes {minted.scopes.join(", ")}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={btn} onClick={() => void copyToken()}>
              {copied ? "Copied ✓" : "Copy key"}
            </button>
            <button type="button" style={btnGhost} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          {error && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(200,40,40,0.06)",
                border: "1px solid rgba(200,40,40,0.3)",
                color: "#a01818",
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <label style={label}>Tenant</label>
          {lockTenant ? (
            <p style={{ fontSize: 14, fontWeight: 600, color: "#222b40", margin: "0 0 12px" }}>
              {lockedTenant?.name ?? "—"}
            </p>
          ) : (
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
              style={{ ...input, cursor: "pointer", background: "#fff" }}
            >
              {tenants.length === 0 && <option value="">No tenants available</option>}
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          <label style={label}>Key name</label>
          <input
            autoFocus={lockTenant}
            style={input}
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="Storefront integration"
            required
          />

          <label style={label}>Scopes</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {SCOPE_META.map((s) => (
              <label key={s.value} style={{ fontSize: 14, display: "flex", alignItems: "flex-start", gap: 8 }} title={s.desc}>
                <input
                  type="checkbox"
                  checked={scopes.includes(s.value)}
                  onChange={(e) =>
                    setScopes((prev) => (e.target.checked ? [...prev, s.value] : prev.filter((x) => x !== s.value)))
                  }
                  style={{ marginTop: 3 }}
                />
                <span>
                  <code>{s.value}</code>
                  <span style={{ color: "#7a8296", fontSize: 12, display: "block" }}>{s.desc}</span>
                </span>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              style={{ ...btn, opacity: minting || scopes.length === 0 || !tenantId ? 0.6 : 1 }}
              disabled={minting || scopes.length === 0 || !tenantId}
            >
              {minting ? "Minting…" : "Mint key"}
            </button>
            <button type="button" style={btnGhost} onClick={onClose} disabled={minting}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
