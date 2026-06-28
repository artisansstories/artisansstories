"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Onboarding launcher (O3) — the entry point to the "process train".
 *
 *   • "Start a new store" — the create form (name → auto-suggested slug, advanced
 *     platform-fee). On submit it POSTs `/api/platform/tenants` then routes into
 *     the wizard at `/platform/onboarding/{id}`.
 *   • "In progress" — every tenant whose store is not yet live (storeEnabled ===
 *     false), each showing its derived N/7 progress + a Resume link. Live stores
 *     drop off the list automatically (derived state, no flag).
 *
 * State is fully derived: the in-progress list reads each tenant's
 * `onboarding-status` (the same single source of truth the wizard renders from).
 */

const ACCENT = "#3D4F7C";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};

const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 4 };
const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)", fontSize: 14,
};
const btn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer",
  background: ACCENT, color: "#fff", fontWeight: 600, fontSize: 14,
  textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
};
const btnGhost: React.CSSProperties = {
  ...btn, background: "rgba(61,79,124,0.1)", color: ACCENT,
};

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  stripeOnboarded: boolean;
  productCount: number;
  createdAt: string;
}

interface StatusSummary {
  storeEnabled: boolean;
  completedCount: number;
  total: number;
}

/** Client mirror of the server slug rules: lowercase, spaces→-, strip non
 * [a-z0-9-], collapse repeated hyphens, trim leading/trailing hyphens. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function OnboardingLauncherPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, StatusSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [feeBps, setFeeBps] = useState(300);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

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
      const rows: TenantRow[] = body.tenants ?? [];
      setTenants(rows);

      // Fetch each tenant's derived onboarding-status in parallel — it's the only
      // source that knows storeEnabled (the tenant list doesn't carry it) and the
      // N/7 progress. The operator console has a small tenant count, so this is
      // reasonable; the list is filtered to non-live stores below.
      const entries = await Promise.all(
        rows.map(async (t) => {
          try {
            const sRes = await fetch(`/api/platform/tenants/${t.id}/onboarding-status`);
            if (!sRes.ok) return null;
            const s = await sRes.json();
            return [t.id, { storeEnabled: s.storeEnabled, completedCount: s.completedCount, total: s.total }] as const;
          } catch {
            return null;
          }
        }),
      );
      const map: Record<string, StatusSummary> = {};
      for (const e of entries) if (e) map[e[0]] = e[1];
      setStatuses(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function onNameChange(v: string) {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
    setSlugError(null);
  }

  function onSlugChange(v: string) {
    setSlugEdited(true);
    setSlug(slugify(v));
    setSlugError(null);
  }

  async function createStore(e: React.FormEvent) {
    e.preventDefault();
    setSlugError(null);
    setError(null);
    if (!name.trim()) { setError("Store name is required."); return; }
    if (slug.length < 2) { setSlugError("Slug must be at least 2 characters."); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug, platformFeeBps: feeBps }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.error === "slug_taken") {
        setSlugError(`"${slug}" is taken — try a different slug.`);
        setCreating(false);
        return;
      }
      if (!res.ok) {
        throw new Error((body.errors && body.errors.join(" ")) || body.message || body.error || `HTTP ${res.status}`);
      }
      // Into the train.
      window.location.href = `/platform/onboarding/${body.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create store");
      setCreating(false);
    }
  }

  // In-progress = every tenant whose store is not yet live. Tenants without a
  // status entry default to "in progress" (a fetch hiccup shouldn't hide them).
  const inProgress = tenants.filter((t) => statuses[t.id]?.storeEnabled !== true);

  const slugTaken = slugError?.includes("taken");

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Onboarding</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 24 }}>
        The process train: take a store from nothing to live and sellable — Stripe, products,
        API key, and go-live, one step at a time. It remembers where you left off.
      </p>

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818" }}>
          {error}
        </div>
      )}

      {/* Start a new store */}
      <form onSubmit={createStore} style={card}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Start a new store</h2>
        <p style={{ color: "#7a8296", fontSize: 13, marginBottom: 16 }}>
          We&apos;ll create the store and drop you onto the first step of the train.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 4 }}>
          <div>
            <label style={label}>Store name</label>
            <input style={input} value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Mike's Pottery" required />
          </div>
          <div>
            <label style={label}>Slug</label>
            <input
              style={{ ...input, borderColor: slugTaken ? "rgba(200,40,40,0.5)" : "rgba(0,0,0,0.15)" }}
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="mikes-pottery"
              required
            />
            <p style={{ fontSize: 12, color: "#8a93a6", marginTop: 4 }}>
              Hosted at <code>/t/{slug || "your-slug"}</code>
            </p>
            {slugError && (
              <p style={{ fontSize: 12, color: "#a01818", marginTop: 4 }}>
                {slugError}
                {slugTaken && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => { setSlug(`${slug}-2`); setSlugError(null); }}
                      style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0, textDecoration: "underline" }}
                    >
                      use {slug}-2
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "8px 0", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {advancedOpen ? "▾" : "▸"} Advanced
        </button>
        {advancedOpen && (
          <div style={{ marginBottom: 12, maxWidth: 280 }}>
            <label style={label}>Platform fee (basis points)</label>
            <input
              style={input}
              type="number"
              min={0}
              max={10000}
              value={feeBps}
              onChange={(e) => setFeeBps(Number(e.target.value))}
            />
            <p style={{ fontSize: 12, color: "#8a93a6", marginTop: 4 }}>
              {(feeBps / 100).toFixed(2)}% taken per sale. Default 300 (3%).
            </p>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button type="submit" style={{ ...btn, opacity: creating ? 0.6 : 1 }} disabled={creating}>
            {creating ? "Creating…" : "Create store & start →"}
          </button>
        </div>
      </form>

      {/* In progress */}
      <div style={card}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>In progress</h2>
        <p style={{ color: "#7a8296", fontSize: 13, marginBottom: 16 }}>
          Stores not yet live. Resume any one and pick up exactly where it left off.
        </p>
        {loading ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : inProgress.length === 0 ? (
          <p style={{ color: "#888", fontSize: 14 }}>No stores in progress — every store is live. 🎉</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {inProgress.map((t) => {
              const s = statuses[t.id];
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#222b40", fontSize: 14 }}>{t.name}</div>
                    <div style={{ color: "#8a93a6", fontSize: 12 }}>
                      {t.slug}
                      {s ? ` · ${s.completedCount}/${s.total} steps` : ""}
                    </div>
                  </div>
                  <a href={`/platform/onboarding/${t.id}`} style={btnGhost}>Resume →</a>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`a:hover { text-decoration: underline !important; }`}</style>
    </div>
  );
}
