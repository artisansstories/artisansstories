/**
 * API Keys inventory (P10 placeholder). A cross-tenant key inventory is planned;
 * for v1, keys are minted and listed per tenant. This page points operators to
 * the per-tenant view so the nav target exists and is never a dead end.
 */
export default function PlatformApiKeysPage() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: "#222b40" }}>API Keys</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 24 }}>Scoped storefront keys are managed per tenant.</p>
      <div style={{ background: "#fff", border: "1px solid rgba(45,59,85,0.10)", borderRadius: 12, padding: 24 }}>
        <p style={{ fontSize: 14, color: "#444", lineHeight: 1.7 }}>
          Mint and review API keys from a tenant&apos;s page. Open{" "}
          <a href="/platform/tenants" style={{ color: "#3D4F7C", fontWeight: 600, textDecoration: "none" }}>Tenants</a>,
          choose a store, and use <strong>Mint API key</strong>. A cross-tenant key inventory is coming in a later release.
        </p>
      </div>
    </div>
  );
}
