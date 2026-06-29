"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ActionChip, fmtAuditTime, fmtDetail } from "../../activity/page";
import { Modal } from "../../_components/Modal";
import { MintKeyModal, scopeTitle } from "../../_components/keys";
import { ROOT_DOMAIN } from "@/lib/tenant-host";

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

interface TenantAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

/** The store roles offered when inviting. "Owner" is the schema's SUPER_ADMIN. */
const ADMIN_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "EDITOR", label: "Editor" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Owner" },
];

function roleLabel(role: string): string {
  return ADMIN_ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
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
const btnWarn: React.CSSProperties = {
  ...btn, background: AMBER,
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
  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");

  // Team / invite (T5).
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "EDITOR" });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);
  const [teamBusyId, setTeamBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Archive confirmation modal (replaces window.confirm for the archive action).
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Mint API key (for this tenant) + inline revoke.
  const [mintOpen, setMintOpen] = useState(false);
  const [confirmingKeyId, setConfirmingKeyId] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, kRes, sRes, aRes, admRes] = await Promise.all([
        fetch(`/api/platform/tenants/${id}`),
        fetch(`/api/platform/tenants/${id}/api-keys`),
        fetch(`/api/platform/tenants/${id}/onboarding-status`),
        fetch(`/api/platform/audit-log?tenantId=${id}&limit=20`),
        fetch(`/api/platform/tenants/${id}/admins`),
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
      if (admRes.ok) {
        const admBody = await admRes.json();
        setAdmins(admBody.admins ?? []);
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
    // Archive routes through its own modal (archiveOpen); suspend still uses a
    // lightweight confirm. Reactivate is non-destructive — no gate.
    if (status === "SUSPENDED" && !window.confirm(`Suspend ${tenant.name}? Its storefront will go offline until you reactivate.`)) return;
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
      setArchiveOpen(false);
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

  /** Invite (or reactivate) a store admin. On success the modal shows which
   *  address the magic link was emailed to, then refreshes the team list. */
  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (inviteBusy) return;
    setInviteBusy(true);
    setInviteError(null);
    setInviteSentTo(null);
    try {
      const res = await fetch(`/api/platform/tenants/${id}/invite-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteForm.name.trim(),
          email: inviteForm.email.trim(),
          role: inviteForm.role,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 429
            ? body.message || "Invite limit reached (5/hour). Try again later."
            : (body.errors?.join(" ") || body.message || body.error || `HTTP ${res.status}`);
        throw new Error(msg);
      }
      setInviteSentTo(body.adminUser?.email ?? inviteForm.email.trim());
      setInviteForm({ name: "", email: "", role: "EDITOR" });
      await load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviteBusy(false);
    }
  }

  /** Toggle a store admin's access (deactivate / reactivate). */
  async function toggleAdmin(admin: TenantAdmin) {
    if (teamBusyId) return;
    if (admin.isActive && !window.confirm(`Deactivate ${admin.name}? They will lose access to this store's admin.`)) return;
    setTeamBusyId(admin.id);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${id}/admins/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !admin.isActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update admin");
    } finally {
      setTeamBusyId(null);
    }
  }

  /** Copy the tenant's subdomain URL to the clipboard. */
  async function copySubdomain(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context) — silently no-op.
    }
  }

  /** Soft-revoke a key (DELETE sets revokedAt). Gated on an inline confirm. */
  async function revokeKey(keyId: string) {
    setRevokingKeyId(keyId);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${id}/api-keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      setConfirmingKeyId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setRevokingKeyId(null);
    }
  }

  const subdomainHost = tenant ? `${tenant.slug}.${ROOT_DOMAIN}` : "";
  const subdomainUrl = `https://${subdomainHost}`;

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
              {/* Copyable subdomain — where this tenant's store + admin live. */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <a
                  href={subdomainUrl}
                  target="_blank"
                  rel="noopener"
                  style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}
                >
                  {subdomainHost} ↗
                </a>
                <button
                  onClick={() => void copySubdomain(subdomainUrl)}
                  title="Copy store URL"
                  style={{
                    border: "1px solid rgba(61,79,124,0.3)", background: "transparent",
                    color: ACCENT, borderRadius: 6, padding: "2px 8px", fontSize: 12,
                    cursor: "pointer", fontWeight: 600,
                  }}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
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
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button style={{ ...btnDanger, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => setArchiveOpen(true)}>Archive</button>
                      <span
                        role="img"
                        aria-label="What is archiving?"
                        title="Archive pauses this store safely. Storefront goes offline, keys are revoked, but all data is preserved and the store can be reactivated."
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 18, height: 18, borderRadius: "50%", border: "1px solid rgba(45,59,85,0.35)",
                          color: MUTED, fontSize: 12, fontWeight: 700, cursor: "help",
                        }}
                      >
                        ⓘ
                      </span>
                    </span>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#222b40" }}>API keys</h2>
              <button style={btn} onClick={() => setMintOpen(true)}>Mint key</button>
            </div>
            {keys.length === 0 ? (
              <p style={{ color: "#888", fontSize: 13 }}>No keys minted yet. Mint one to let this store&apos;s integration read products and start checkouts.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                      <th style={{ padding: "8px 8px" }}>Name</th>
                      <th style={{ padding: "8px 8px" }}>Prefix</th>
                      <th style={{ padding: "8px 8px" }}>Scopes</th>
                      <th style={{ padding: "8px 8px" }}>Status</th>
                      <th style={{ padding: "8px 8px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)", opacity: k.revokedAt ? 0.6 : 1 }}>
                        <td style={{ padding: "10px 8px", fontWeight: 600 }}>{k.name}</td>
                        <td style={{ padding: "10px 8px" }}><code>{k.prefix}</code></td>
                        <td style={{ padding: "10px 8px", color: "#666", cursor: "help" }} title={scopeTitle(k.scopes)}>{k.scopes.join(", ")}</td>
                        <td style={{ padding: "10px 8px", color: k.revokedAt ? "#9a3838" : GREEN, fontWeight: 600 }}>{k.revokedAt ? "revoked" : "active"}</td>
                        <td style={{ padding: "10px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {k.revokedAt ? (
                            <span style={{ color: "#aab", fontSize: 13 }}>—</span>
                          ) : confirmingKeyId === k.id ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                              <span style={{ fontSize: 12.5, color: "#9a3838" }}>Revoke this key? This cannot be undone.</span>
                              <button
                                onClick={() => void revokeKey(k.id)}
                                disabled={revokingKeyId === k.id}
                                style={{ ...btn, background: "#9a3838", padding: "5px 12px", fontSize: 13, opacity: revokingKeyId === k.id ? 0.5 : 1 }}
                              >
                                {revokingKeyId === k.id ? "Revoking…" : "Confirm"}
                              </button>
                              <button
                                onClick={() => setConfirmingKeyId(null)}
                                disabled={revokingKeyId === k.id}
                                style={{ ...btnGhost, padding: "5px 12px", fontSize: 13 }}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmingKeyId(k.id)}
                              style={{ ...btnDanger, padding: "5px 12px", fontSize: 13 }}
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

          {/* Team (T5): the store's AdminUsers. Operators invite (magic link to
              the tenant's subdomain) and deactivate access here. */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#222b40" }}>Team</h2>
              <button
                style={btn}
                onClick={() => { setInviteError(null); setInviteSentTo(null); setInviteForm({ name: "", email: "", role: "EDITOR" }); setInviteOpen(true); }}
              >
                Invite Admin
              </button>
            </div>
            {admins.length === 0 ? (
              <p style={{ color: "#888", fontSize: 13 }}>No admins yet. Invite the store owner to get them into their admin.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                      <th style={{ padding: "8px 8px" }}>Name</th>
                      <th style={{ padding: "8px 8px" }}>Email</th>
                      <th style={{ padding: "8px 8px" }}>Role</th>
                      <th style={{ padding: "8px 8px" }}>Status</th>
                      <th style={{ padding: "8px 8px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((a) => (
                      <tr key={a.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                        <td style={{ padding: "10px 8px", fontWeight: 600 }}>{a.name}</td>
                        <td style={{ padding: "10px 8px", color: "#666" }}>{a.email}</td>
                        <td style={{ padding: "10px 8px" }}>{roleLabel(a.role)}</td>
                        <td style={{ padding: "10px 8px" }}>
                          <span style={{ color: a.isActive ? GREEN : "#9a3838" }}>
                            <span aria-hidden>{a.isActive ? "✓" : "✗"}</span> {a.isActive ? "active" : "inactive"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right" }}>
                          <button
                            style={{
                              ...(a.isActive ? btnDanger : btnGhost),
                              padding: "5px 12px", fontSize: 13,
                              opacity: teamBusyId === a.id ? 0.5 : 1,
                            }}
                            disabled={teamBusyId === a.id}
                            onClick={() => void toggleAdmin(a)}
                          >
                            {teamBusyId === a.id ? "Working…" : a.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        </td>
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

      {/* Archive confirmation — warning (amber), not destructive. Explains that
          archive is a reversible pause, distinct from a permanent delete. */}
      {archiveOpen && tenant && (
        <Modal ariaLabel={`Archive ${tenant.name}`} onClose={() => setArchiveOpen(false)} closeDisabled={busy} maxWidth={480}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: AMBER, marginBottom: 10 }}>
            Archive {tenant.name}?
          </h2>
          <ul style={{ fontSize: 14, color: "#4a5266", lineHeight: 1.6, margin: "0 0 14px", paddingLeft: 20 }}>
            <li>The storefront goes offline immediately (customers see a 404)</li>
            <li>All API keys are revoked</li>
            <li>Orders and data are preserved</li>
            <li>You can reactivate at any time from this page</li>
            <li><strong>This is NOT deletion</strong> — a deleted store cannot be recovered</li>
          </ul>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => setArchiveOpen(false)}>
              Cancel
            </button>
            <button
              style={{ ...btnWarn, opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={() => void changeStatus("ARCHIVED")}
            >
              {busy ? "Archiving…" : "Archive Store"}
            </button>
          </div>
        </Modal>
      )}

      {/* Mint API key for this tenant — tenant is locked to this store. */}
      {mintOpen && tenant && (
        <MintKeyModal
          tenants={[{ id: tenant.id, name: tenant.name }]}
          initialTenantId={tenant.id}
          lockTenant
          onClose={() => setMintOpen(false)}
          onMinted={() => void load()}
        />
      )}

      {/* Invite Admin modal (T5). */}
      {inviteOpen && tenant && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Invite an admin to ${tenant.name}`}
          onClick={() => { if (!inviteBusy) setInviteOpen(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(20,26,40,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...card, marginBottom: 0, maxWidth: 460, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#222b40", marginBottom: 4 }}>
              Invite admin to {tenant.name}
            </h2>
            <p style={{ fontSize: 13, color: "#7a8296", marginBottom: 16 }}>
              They’ll get a magic sign-in link at <strong>{subdomainHost}</strong>.
            </p>

            {inviteSentTo ? (
              <>
                <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(28,124,74,0.08)", border: "1px solid rgba(28,124,74,0.3)", color: GREEN, fontSize: 14, marginBottom: 16 }}>
                  ✓ Invite sent to <strong>{inviteSentTo}</strong>.
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button style={btn} onClick={() => setInviteOpen(false)}>Done</button>
                </div>
              </>
            ) : (
              <form onSubmit={submitInvite} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {inviteError && (
                  <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(200,40,40,0.06)", border: "1px solid rgba(200,40,40,0.3)", color: "#a01818", fontSize: 13 }}>
                    {inviteError}
                  </div>
                )}
                <label style={{ fontSize: 13, color: "#4a5266", fontWeight: 600 }}>
                  Name
                  <input
                    autoFocus
                    required
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Jane Doe"
                    style={{ marginTop: 4, width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14, border: "1px solid rgba(45,59,85,0.25)", boxSizing: "border-box" }}
                  />
                </label>
                <label style={{ fontSize: 13, color: "#4a5266", fontWeight: 600 }}>
                  Email
                  <input
                    required
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="jane@example.com"
                    style={{ marginTop: 4, width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14, border: "1px solid rgba(45,59,85,0.25)", boxSizing: "border-box" }}
                  />
                </label>
                <label style={{ fontSize: 13, color: "#4a5266", fontWeight: 600 }}>
                  Role
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}
                    style={{ marginTop: 4, width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14, border: "1px solid rgba(45,59,85,0.25)", boxSizing: "border-box", background: "#fff" }}
                  >
                    {ADMIN_ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                  <button type="button" style={{ ...btnGhost, opacity: inviteBusy ? 0.5 : 1 }} disabled={inviteBusy} onClick={() => setInviteOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" style={{ ...btn, opacity: inviteBusy ? 0.6 : 1 }} disabled={inviteBusy}>
                    {inviteBusy ? "Sending…" : "Send invite"}
                  </button>
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
