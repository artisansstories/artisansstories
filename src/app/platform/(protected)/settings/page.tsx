import { getPlatformSession } from "@/lib/platform-session";

/**
 * Operator settings (P10) — account summary for the signed-in operator. Operator
 * management (inviting/deactivating operators) is a later release; for now this
 * confirms identity and the disjoint operator session.
 */
export default async function PlatformSettingsPage() {
  const operator = await getPlatformSession();

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid rgba(45,59,85,0.10)",
    borderRadius: 12,
    padding: 24,
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>Settings</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 24 }}>Your platform operator account.</p>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "12px 16px", fontSize: 14 }}>
          <span style={{ color: "#7a8296" }}>Name</span>
          <span style={{ color: "#222b40", fontWeight: 600 }}>{operator?.name ?? "—"}</span>
          <span style={{ color: "#7a8296" }}>Email</span>
          <span style={{ color: "#222b40" }}>{operator?.email ?? "—"}</span>
          <span style={{ color: "#7a8296" }}>Role</span>
          <span style={{ color: "#222b40" }}>Operator</span>
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: "#7a8296", lineHeight: 1.6 }}>
          This is a platform-operator session (<code>as-platform-session</code>) — fully separate from any
          store admin. Operator management arrives in a later release.
        </p>
        <p style={{ marginTop: 12, fontSize: 13, color: "#7a8296", lineHeight: 1.6 }}>
          Review audited operator actions (impersonation, go-live, tenant lifecycle) on the{" "}
          <a href="/platform/activity" style={{ color: "#3D4F7C", fontWeight: 600, textDecoration: "none" }}>Activity</a> page.
        </p>
      </div>
    </div>
  );
}
