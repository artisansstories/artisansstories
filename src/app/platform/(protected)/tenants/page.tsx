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
  isPlatformOwner: boolean;
  storeEnabled: boolean;
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

/** Status-filter dropdown options. "" = all active (archived hidden unless the
 * Show-archived toggle is on); the rest map straight to a ?status= filter. */
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All active" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING", label: "Pending" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "ARCHIVED", label: "Archived" },
];

type SortCol = "createdAt" | "name";

const ACCENT = "#3D4F7C";
const GREEN = "#1c7c4a";

/** Compact created-date for the list column. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

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
const linkBtn: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(61,79,124,0.35)",
  cursor: "pointer", background: "transparent", color: ACCENT, fontWeight: 600,
  fontSize: 13, textDecoration: "none", display: "inline-block",
};

/** Human-readable mapping for the machine error codes the PATCH endpoint emits. */
function lifecycleErrorMessage(code: string, fallback: string): string {
  if (code === "platform_owner_protected")
    return "The house store can’t be archived or suspended.";
  return fallback;
}

/** "View store" link — always points at /t/{slug}; labels non-live stores as a
 * preview so the operator isn't surprised by the storefront's 404 gate. */
function ViewStoreLink({ slug, live }: { slug: string; live: boolean }) {
  return (
    <a
      href={`/t/${slug}`}
      target="_blank"
      rel="noopener"
      style={{ ...linkBtn, color: live ? ACCENT : "#9a6a12", borderColor: live ? "rgba(61,79,124,0.35)" : "rgba(154,106,18,0.4)" }}
      title={live ? "Open the live storefront" : "Store is not live yet — this will 404"}
    >
      {live ? "View store ↗" : "Preview (not live yet) ↗"}
    </a>
  );
}

/** A clickable column header that toggles sort on `col` and shows the active
 * direction arrow. Renders as a button for keyboard/a11y. */
function SortHeader({
  label, col, sort, dir, onToggle,
}: {
  label: string;
  col: SortCol;
  sort: SortCol;
  dir: "asc" | "desc";
  onToggle: (c: SortCol) => void;
}) {
  const active = sort === col;
  return (
    <button
      type="button"
      onClick={() => onToggle(col)}
      aria-label={`Sort by ${label}${active ? (dir === "asc" ? ", ascending" : ", descending") : ""}`}
      style={{
        background: "none", border: "none", padding: 0, cursor: "pointer",
        font: "inherit", color: active ? ACCENT : "#888", fontWeight: active ? 700 : 400,
        display: "inline-flex", alignItems: "center", gap: 4,
      }}
    >
      {label}
      <span aria-hidden style={{ fontSize: 10, opacity: active ? 1 : 0.3 }}>
        {active ? (dir === "asc" ? "▲" : "▼") : "▾"}
      </span>
    </button>
  );
}

/** POST to the impersonation start endpoint via a real form so the browser
 * follows the server redirect into /admin (and carries the freshly-set cookie).
 * Impersonation mints an admin session into someone's store and is audited, so
 * it confirms first (P2-1). */
function startImpersonation(tenantId: string, name: string) {
  if (!window.confirm(`Enter ${name}'s admin as operator? This action is audited.`)) return;
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

  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Search / filter / sort (A5). `search` is the live input; `q` is its debounced
  // value (what we actually query with) so we don't refetch on every keystroke.
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<SortCol>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  // Debounce the search box → q (250ms).
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (statusFilter) params.set("status", statusFilter);
      else if (showArchived) params.set("includeArchived", "1");
      params.set("sort", sort);
      params.set("dir", dir);
      const res = await fetch(`/api/platform/tenants?${params.toString()}`);
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
  }, [q, statusFilter, showArchived, sort, dir]);

  useEffect(() => { void load(); }, [load]);

  /** Toggle a sortable column: same column flips direction, new column resets to
   * its natural default (Z-fresh for dates, A→Z for name). */
  function toggleSort(col: SortCol) {
    if (sort === col) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(col);
      setDir(col === "createdAt" ? "desc" : "asc");
    }
  }

  /** Status lifecycle action (archive / suspend / reactivate) via PATCH, with a
   * confirm gate for the destructive ones. Surfaces 403 platform_owner_protected
   * as readable copy rather than raw JSON. */
  async function changeStatus(t: TenantRow, status: "ARCHIVED" | "SUSPENDED" | "ACTIVE") {
    const confirmMsg =
      status === "ARCHIVED"
        ? `Archive ${t.name}? Its storefront will go offline and API keys will be revoked. You can reactivate later.`
        : status === "SUSPENDED"
          ? `Suspend ${t.name}? Its storefront will go offline until you reactivate.`
          : null;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(lifecycleErrorMessage(body.error, body.message || body.error || `HTTP ${res.status}`));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusyId(null);
    }
  }

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

  const closeMintModal = useCallback(() => {
    setMintFor(null);
    setKeyName("");
    setKeyScopes(["store:read", "checkout:create"]);
    setMinted(null);
  }, []);

  // ESC closes the mint-key modal (a11y, P2-3).
  useEffect(() => {
    if (!mintFor) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMintModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mintFor, closeMintModal]);

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#222b40" }}>All tenants</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or slug…"
              aria-label="Search tenants by name or slug"
              style={{ ...input, marginBottom: 0, width: 220 }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              style={{ ...input, marginBottom: 0, width: "auto", cursor: "pointer" }}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <label
              style={{ fontSize: 13, color: "#666", display: "inline-flex", alignItems: "center", gap: 6, cursor: statusFilter ? "not-allowed" : "pointer", opacity: statusFilter ? 0.5 : 1 }}
              title={statusFilter ? "Clear the status filter to use this toggle" : undefined}
            >
              <input type="checkbox" checked={showArchived} disabled={!!statusFilter} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>
          </div>
        </div>
        {loading ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : tenants.length === 0 ? (
          <p style={{ color: "#888" }}>
            {q ? `No stores match “${q}”.` : statusFilter ? "No tenants match this filter." : "No tenants yet."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                  <th style={{ padding: "8px 8px" }}>
                    <SortHeader label="Name" col="name" sort={sort} dir={dir} onToggle={toggleSort} />
                  </th>
                  <th style={{ padding: "8px 8px" }}>Slug</th>
                  <th style={{ padding: "8px 8px" }}>Status</th>
                  <th style={{ padding: "8px 8px" }}>
                    <SortHeader label="Created" col="createdAt" sort={sort} dir={dir} onToggle={toggleSort} />
                  </th>
                  <th style={{ padding: "8px 8px" }}>Store</th>
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
                    <td style={{ padding: "10px 8px", color: "#666", whiteSpace: "nowrap" }}>{fmtDate(t.createdAt)}</td>
                    <td style={{ padding: "10px 8px" }}>
                      <ViewStoreLink slug={t.slug} live={t.storeEnabled && t.status === "ACTIVE"} />
                    </td>
                    <td style={{ padding: "10px 8px", color: t.stripeOnboarded ? GREEN : "#9a3838" }}>{t.stripeOnboarded ? "Onboarded" : "Not onboarded"}</td>
                    <td style={{ padding: "10px 8px" }}>{t.productCount}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button style={{ ...btnGhost, marginRight: 8 }} onClick={() => setMintFor(t)}>Mint API key</button>
                      <button style={{ ...btn, marginRight: 8 }} onClick={() => startImpersonation(t.id, t.name)}>Impersonate</button>
                      {!t.isPlatformOwner && (
                        t.status === "ARCHIVED" || t.status === "SUSPENDED" ? (
                          <button style={{ ...linkBtn, opacity: busyId === t.id ? 0.5 : 1 }} disabled={busyId === t.id} onClick={() => changeStatus(t, "ACTIVE")}>Reactivate</button>
                        ) : (
                          <button style={{ ...linkBtn, color: "#9a3838", borderColor: "rgba(154,56,56,0.4)", opacity: busyId === t.id ? 0.5 : 1 }} disabled={busyId === t.id} onClick={() => changeStatus(t, "ARCHIVED")}>Archive</button>
                        )
                      )}
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
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Mint API key for ${mintFor.name}`}
            style={{ ...card, width: "100%", maxWidth: 480, position: "relative" }}
          >
            <button
              type="button"
              onClick={closeMintModal}
              aria-label="Close"
              style={{ position: "absolute", top: 14, right: 14, background: "transparent", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, color: "#888", padding: 4 }}
            >
              ×
            </button>
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
                <input autoFocus style={input} value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Storefront integration" required />
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
