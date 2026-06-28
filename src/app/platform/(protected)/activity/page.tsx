"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Activity (A7 / P2-5) — read-only viewer over PlatformAuditLog. The trail is
 * written everywhere an operator crosses the tenant boundary (impersonation,
 * go-live, archive/suspend/reactivate/delete) but was invisible until now.
 *
 * Reads GET /api/platform/audit-log (operator-gated). Optional action filter.
 */

interface AuditEntry {
  id: string;
  operatorEmail: string;
  action: string;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  detail: string | null;
  createdAt: string;
}

const ACCENT = "#3D4F7C";

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

/** The audit action vocabulary, for the filter dropdown. "" = all. */
const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All actions" },
  { value: "impersonate.start", label: "Impersonate start" },
  { value: "impersonate.stop", label: "Impersonate stop" },
  { value: "tenant.archive", label: "Archive" },
  { value: "tenant.suspend", label: "Suspend" },
  { value: "tenant.reactivate", label: "Reactivate" },
  { value: "tenant.delete", label: "Delete" },
  { value: "go-live", label: "Go live" },
];

/** Visual treatment per action family — a TEXT label plus a colour (never colour
 * alone, for a11y). Unknown actions fall back to a neutral chip. */
function actionStyle(action: string): { bg: string; fg: string } {
  if (action.startsWith("impersonate")) return { bg: "rgba(61,79,124,0.12)", fg: "#3D4F7C" };
  if (action === "tenant.delete") return { bg: "rgba(154,56,56,0.12)", fg: "#9a3838" };
  if (action === "tenant.archive" || action === "tenant.suspend")
    return { bg: "rgba(154,106,18,0.14)", fg: "#9a6a12" };
  if (action === "tenant.reactivate" || action === "go-live")
    return { bg: "rgba(28,124,74,0.12)", fg: "#1c7c4a" };
  return { bg: "rgba(45,59,85,0.08)", fg: "#4a5266" };
}

/** Absolute, sortable timestamp — operators need exact times for an audit trail. */
export function fmtAuditTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Detail strings are sometimes JSON (tenant.delete snapshots) — render those as
 * a compact one-liner rather than raw braces. */
export function fmtDetail(detail: string | null): string {
  if (!detail) return "—";
  const trimmed = detail.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object") {
        const counts = obj.counts
          ? ` (${Object.entries(obj.counts)
              .map(([k, v]) => `${v} ${k}`)
              .join(", ")})`
          : "";
        const label = obj.name || obj.slug || "";
        return label ? `${label}${counts}` : trimmed;
      }
    } catch {
      /* fall through to raw */
    }
  }
  return trimmed;
}

/** Action chip — shared with the tenant-detail Recent activity section. */
export function ActionChip({ action }: { action: string }) {
  const { bg, fg } = actionStyle(action);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {action}
    </span>
  );
}

export default function PlatformActivityPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`/api/platform/audit-log?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      setEntries(body.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Activity</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 24 }}>
        Audited operator actions across the platform — impersonation, go-live, and tenant lifecycle
        changes. Newest first (latest 100).
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
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#222b40" }}>Audit log</h2>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Filter by action"
            style={{ ...input, cursor: "pointer" }}
          >
            {ACTION_FILTERS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : entries.length === 0 ? (
          <p style={{ color: "#888" }}>
            {actionFilter ? "No activity matches this filter." : "No operator activity recorded yet."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                  <th style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>Time</th>
                  <th style={{ padding: "8px 8px" }}>Operator</th>
                  <th style={{ padding: "8px 8px" }}>Action</th>
                  <th style={{ padding: "8px 8px" }}>Tenant</th>
                  <th style={{ padding: "8px 8px" }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <td style={{ padding: "10px 8px", color: "#666", whiteSpace: "nowrap" }}>
                      {fmtAuditTime(e.createdAt)}
                    </td>
                    <td style={{ padding: "10px 8px", color: "#444" }}>{e.operatorEmail}</td>
                    <td style={{ padding: "10px 8px" }}>
                      <ActionChip action={e.action} />
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {e.tenantId ? (
                        e.tenantName ? (
                          <a
                            href={`/platform/tenants/${e.tenantId}`}
                            style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}
                          >
                            {e.tenantName}
                          </a>
                        ) : (
                          <span style={{ color: "#999" }} title="Tenant no longer exists">
                            {e.tenantSlug ?? e.tenantId} (deleted)
                          </span>
                        )
                      ) : (
                        <span style={{ color: "#bbb" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px", color: "#666" }}>{fmtDetail(e.detail)}</td>
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
