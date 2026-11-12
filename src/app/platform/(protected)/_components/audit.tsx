/**
 * Shared audit-log display helpers (activity page + tenant detail). Moved out of
 * activity/page.tsx: Next.js page files may only export the page and segment
 * config, and these extra exports failed the build's page type check.
 */
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
