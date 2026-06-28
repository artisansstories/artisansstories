"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ActionChip, fmtAuditTime, fmtDetail } from "../../activity/page";

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
  storeEnabled: boolean;
  stats: {
    ordersCount: number;
    paidOrdersCount: number;
    paidRevenueCents: number;
    customersCount: number;
  };
}

interface AuditEntry {
  id: string;
  operatorEmail: string;
  action: string;
  detail: string | null;
  createdAt: string;
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

/** Read-only mirror of the derived onboarding map (the same source of truth the
 * wizard renders from). See GET /api/platform/tenants/[id]/onboarding-status. */
interface OnboardingStatus {
  storeEnabled: boolean;
  steps: {
    create: { done: boolean };
    branding: { done: boolean; optional: boolean; usingDefaults: boolean };
    stripe: { done: boolean; state: "none" | "in_progress" | "onboarded"; accountId: string | null };
    products: { done: boolean; count: number };
    apiKey: { done: boolean; activeCount: number };
    integration: { done: boolean };
    goLive: { done: boolean; blockedBy: string[] };
  };
  currentStep: string;
  completedCount: number;
  total: number;
}

type ChecklistKind = "done" | "pending" | "blocked" | "optional";

const CHECKLIST: { key: keyof OnboardingStatus["steps"]; label: string }[] = [
  { key: "create", label: "Store created" },
  { key: "branding", label: "Branding" },
  { key: "stripe", label: "Stripe Connect" },
  { key: "products", label: "Products" },
  { key: "apiKey", label: "API key" },
  { key: "integration", label: "Integration ready" },
  { key: "goLive", label: "Live" },
];

const ACCENT = "#3D4F7C";
const GREEN = "#1c7c4a";
const AMBER = "#9a6a12";
const MUTED = "#8a93a6";

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
  textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
};

const btnGhost: React.CSSProperties = {
  ...btn, background: "transparent", color: ACCENT, border: "1px solid rgba(61,79,124,0.35)",
};
const btnDanger: React.CSSProperties = {
  ...btnGhost, color: "#9a3838", border: "1px solid rgba(154,56,56,0.4)",
};

/** Human-readable mapping for the machine error codes the PATCH/DELETE endpoints
 * emit, so the operator never sees a raw code or JSON. */
function lifecycleErrorMessage(code: string, fallback: string, count?: number): string {
  if (code === "platform_owner_protected")
    return "The house store can’t be archived or suspended.";
  if (code === "platform_owner_undeletable")
    return "The house store can’t be deleted.";
  if (code === "slug_mismatch")
    return "The typed slug didn’t match. Nothing was deleted.";
  if (code === "has_paid_orders")
    return `This store has ${count ?? "some"} paid order${count === 1 ? "" : "s"} — archive it instead of deleting.`;
  return fallback;
}

function startImpersonation(tenantId: string, name: string) {
  // Impersonation mints an admin session into the store and is audited — confirm
  // first (P2-1).
  if (!window.confirm(`Enter ${name}'s admin as operator? This action is audited.`)) return;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `/api/platform/tenants/${tenantId}/impersonate`;
  document.body.appendChild(form);
  form.submit();
}

/** Format a CENTS integer as USD, e.g. 123456 → "$1,234.56". */
function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100,
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  // Status is conveyed by glyph (✓/✗) + an explicit "yes/no" word, never by
  // colour alone (a11y, P2-3).
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
        color: on ? GREEN : "#9a3838",
      }}
    >
      <span aria-hidden>{on ? "✓" : "✗"}</span> {label}
      <span style={{ color: "#8a93a6" }}>— {on ? "yes" : "no"}</span>
    </span>
  );
}

/** Derive a step's visual state from the aggregator (mirrors the wizard rail). */
function checklistKind(
  key: keyof OnboardingStatus["steps"],
  status: OnboardingStatus,
): ChecklistKind {
  const st = status.steps[key];
  if (st.done) return "done";
  if (key === "stripe" && status.steps.stripe.state === "in_progress") return "blocked";
  if (key === "branding") return "optional";
  return "pending";
}

function ChecklistRow({ label, kind }: { label: string; kind: ChecklistKind }) {
  const map = {
    done: { sym: "✓", color: GREEN, sub: "done" },
    blocked: { sym: "●", color: AMBER, sub: "in progress" },
    optional: { sym: "○", color: MUTED, sub: "optional" },
    pending: { sym: "○", color: MUTED, sub: "pending" },
  }[kind];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
      <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", background: kind === "done" ? GREEN : kind === "blocked" ? AMBER : "rgba(45,59,85,0.12)", color: kind === "done" || kind === "blocked" ? "#fff" : MUTED, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{map.sym}</span>
      <span style={{ color: "#222b40", fontWeight: 500 }}>{label}</span>
      <span style={{ color: map.color, fontSize: 12, marginLeft: "auto" }}>{map.sub}</span>
    </div>
  );
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, kRes, sRes, aRes] = await Promise.all([
        fetch(`/api/platform/tenants/${id}`),
        fetch(`/api/platform/tenants/${id}/api-keys`),
        fetch(`/api/platform/tenants/${id}/onboarding-status`),
        fetch(`/api/platform/audit-log?tenantId=${id}&limit=20`),
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
      if (sRes.ok) {
        setStatus(await sRes.json());
      }
      if (aRes.ok) {
        const aBody = await aRes.json();
        setActivity(aBody.entries ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tenant");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /** Lifecycle action (archive / suspend / reactivate) via PATCH, with a confirm
   * gate for the destructive transitions. Surfaces platform_owner_protected and
   * other errors as readable copy, never raw JSON. */
  async function changeStatus(status: "ARCHIVED" | "SUSPENDED" | "ACTIVE") {
    if (!tenant) return;
    const confirmMsg =
      status === "ARCHIVED"
        ? `Archive ${tenant.name}? Its storefront will go offline and API keys will be revoked. You can reactivate later.`
        : status === "SUSPENDED"
          ? `Suspend ${tenant.name}? Its storefront will go offline until you reactivate.`
          : null;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${id}`, {
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
      setBusy(false);
    }
  }

  /** Irreversible hard delete. Gated on a typed-slug match (the modal disables
   * the button until the slug matches). On success routes back to the list. */
  async function deletePermanently() {
    if (!tenant || confirmSlug !== tenant.slug) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          lifecycleErrorMessage(body.error, body.message || body.error || `HTTP ${res.status}`, body.count),
        );
      }
      // Gone — leave the (now-404'ing) detail page for the tenant list.
      window.location.href = "/platform/tenants";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete tenant");
      setDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  }

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
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, margin: "16px 0 24px", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: "#222b40" }}>{tenant.name}</h1>
              <p style={{ color: "#7a8296", fontSize: 14 }}>
                {tenant.slug} · {tenant.status}
                {tenant.isPlatformOwner ? " · house store" : ""}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {/* View store — always links to /t/{slug}; labels a non-live store as
                  a preview so the 404 gate isn't a surprise. */}
              <a
                href={`/t/${tenant.slug}`}
                target="_blank"
                rel="noopener"
                style={{
                  ...btnGhost,
                  color: tenant.storeEnabled && tenant.status === "ACTIVE" ? ACCENT : AMBER,
                  borderColor: tenant.storeEnabled && tenant.status === "ACTIVE" ? "rgba(61,79,124,0.35)" : "rgba(154,106,18,0.4)",
                }}
              >
                {tenant.storeEnabled && tenant.status === "ACTIVE" ? "View store ↗" : "Preview (not live yet) ↗"}
              </a>
              <button style={btn} onClick={() => startImpersonation(tenant.id, tenant.name)}>Impersonate</button>
              {/* Lifecycle — hidden entirely for the house/platform-owner tenant. */}
              {!tenant.isPlatformOwner && (
                tenant.status === "ARCHIVED" || tenant.status === "SUSPENDED" ? (
                  <>
                    <button style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => changeStatus("ACTIVE")}>
                      {busy ? "Working…" : "Reactivate"}
                    </button>
                    {/* Hard delete is gated to ARCHIVED tenants only — a SUSPENDED
                        store is a punitive hold, not a retirement. Paid-order /
                        house guards are enforced server-side (mapped to copy). */}
                    {tenant.status === "ARCHIVED" && (
                      <button
                        style={{ ...btnDanger, opacity: busy ? 0.5 : 1 }}
                        disabled={busy}
                        onClick={() => { setConfirmSlug(""); setDeleteOpen(true); }}
                      >
                        Delete permanently
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button style={{ ...btnDanger, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => changeStatus("SUSPENDED")}>Suspend</button>
                    <button style={{ ...btnDanger, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => changeStatus("ARCHIVED")}>Archive</button>
                  </>
                )
              )}
            </div>
          </div>

          {/* Onboarding checklist — read-only mirror of the derived status, with a
              prominent Resume entry into the wizard and the permanent Integration link. */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#222b40" }}>
                Onboarding
                {status && (
                  <span style={{ color: MUTED, fontWeight: 500, fontSize: 14 }}> · {status.completedCount}/{status.total}{status.storeEnabled ? " · live ✓" : ""}</span>
                )}
              </h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a href={`/platform/onboarding/${tenant.id}`} style={btn}>Resume onboarding →</a>
                <a href={`/platform/tenants/${tenant.id}/integration`} style={btnGhost}>Integration page →</a>
              </div>
            </div>
            {status ? (
              <>
                <div style={{ height: 8, borderRadius: 999, background: "rgba(45,59,85,0.10)", overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ width: `${(status.completedCount / status.total) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${ACCENT}, #5B6EA8)` }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {CHECKLIST.map((step) => (
                    <ChecklistRow key={step.key} label={step.label} kind={checklistKind(step.key, status)} />
                  ))}
                </div>
              </>
            ) : (
              <p style={{ color: "#888", fontSize: 13 }}>Onboarding status unavailable.</p>
            )}
          </div>

          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#222b40" }}>Overview</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, fontSize: 14 }}>
              <div><span style={{ color: "#7a8296" }}>Products</span><br />{tenant.productCount}</div>
              <div><span style={{ color: "#7a8296" }}>Platform fee</span><br />{(tenant.platformFeeBps / 100).toFixed(2)}%</div>
              <div><span style={{ color: "#7a8296" }}>Checkout mode</span><br />{tenant.checkoutMode}</div>
              <div><span style={{ color: "#7a8296" }}>Active API keys</span><br />{tenant.activeApiKeyCount} / {tenant.apiKeyCount}</div>
            </div>
            {/* Ops stats (A6 / P1-3): tell a live, earning store from a dead one —
                and surface the paid-orders count that gates a safe hard delete. */}
            <div style={{ height: 1, background: "rgba(45,59,85,0.08)", margin: "16px 0" }} />
            {tenant.stats.ordersCount === 0 && tenant.stats.customersCount === 0 ? (
              <p style={{ color: "#8a93a6", fontSize: 13, margin: 0 }}>No orders yet.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, fontSize: 14 }}>
                <div>
                  <span style={{ color: "#7a8296" }}>Paid revenue</span><br />
                  <strong style={{ color: GREEN }}>{fmtCents(tenant.stats.paidRevenueCents)}</strong>
                </div>
                <div><span style={{ color: "#7a8296" }}>Orders</span><br />{tenant.stats.ordersCount}</div>
                <div><span style={{ color: "#7a8296" }}>Paid orders</span><br />{tenant.stats.paidOrdersCount}</div>
                <div><span style={{ color: "#7a8296" }}>Customers</span><br />{tenant.stats.customersCount}</div>
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#222b40" }}>Stripe</h2>
              <a href={`/platform/onboarding/${tenant.id}?step=stripe`} style={btnGhost}>
                {tenant.stripe.onboarded ? "Manage Stripe →" : "Set up Stripe →"}
              </a>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
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

          {/* Recent activity (A7 / P2-5): the archive/delete/impersonate history
              for THIS store, filtered to its tenantId. Read-only. */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#222b40" }}>Recent activity</h2>
              <a href="/platform/activity" style={{ ...btnGhost, padding: "6px 12px", fontSize: 13 }}>All activity →</a>
            </div>
            {activity.length === 0 ? (
              <p style={{ color: "#888", fontSize: 13 }}>No operator activity for this store yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                      <th style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>Time</th>
                      <th style={{ padding: "8px 8px" }}>Operator</th>
                      <th style={{ padding: "8px 8px" }}>Action</th>
                      <th style={{ padding: "8px 8px" }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((a) => (
                      <tr key={a.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                        <td style={{ padding: "10px 8px", color: "#666", whiteSpace: "nowrap" }}>{fmtAuditTime(a.createdAt)}</td>
                        <td style={{ padding: "10px 8px", color: "#444" }}>{a.operatorEmail}</td>
                        <td style={{ padding: "10px 8px" }}><ActionChip action={a.action} /></td>
                        <td style={{ padding: "10px 8px", color: "#666" }}>{fmtDetail(a.detail)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Typed-slug confirmation for the irreversible hard delete. */}
      {deleteOpen && tenant && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Delete ${tenant.name}`}
          onClick={() => { if (!busy) setDeleteOpen(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(20,26,40,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...card, marginBottom: 0, maxWidth: 460, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#9a3838", marginBottom: 8 }}>
              Delete {tenant.name} permanently
            </h2>
            <p style={{ fontSize: 14, color: "#4a5266", lineHeight: 1.5, marginBottom: 8 }}>
              This permanently removes the store and <strong>every</strong> product, customer,
              order, and setting it owns. <strong>This cannot be undone.</strong>
            </p>
            <p style={{ fontSize: 14, color: "#4a5266", marginBottom: 14 }}>
              Type <code style={{ background: "rgba(45,59,85,0.08)", padding: "1px 6px", borderRadius: 4 }}>{tenant.slug}</code> to confirm.
            </p>
            <input
              autoFocus
              value={confirmSlug}
              onChange={(e) => setConfirmSlug(e.target.value)}
              placeholder={tenant.slug}
              aria-label="Type the slug to confirm deletion"
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14,
                border: "1px solid rgba(45,59,85,0.25)", marginBottom: 16, boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button
                style={{
                  ...btn, background: "#9a3838",
                  opacity: busy || confirmSlug !== tenant.slug ? 0.45 : 1,
                  cursor: busy || confirmSlug !== tenant.slug ? "not-allowed" : "pointer",
                }}
                disabled={busy || confirmSlug !== tenant.slug}
                onClick={() => void deletePermanently()}
              >
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`a:hover { text-decoration: underline !important; }`}</style>
    </div>
  );
}
