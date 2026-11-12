import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { mcpGloballyEnabled } from "@/lib/mcp/config";
import { validateAuthorizeParams } from "@/lib/mcp/oauth";
import { isTenantMcpEnabled } from "@/lib/mcp/tenant-flag";

/**
 * OAuth consent for MCP clients. Lives under /admin so the proxy routes anyone
 * without an admin session through magic-link login and back here. The form
 * posts to /oauth/authorize/decision, which re-validates everything.
 */
export const dynamic = "force-dynamic";

const CARD: React.CSSProperties = {
  maxWidth: 480,
  margin: "64px auto",
  background: "#fff",
  border: "1px solid #ede8df",
  borderRadius: 12,
  padding: 28,
  fontFamily: "'Inter', sans-serif",
  color: "#3a2e24",
};
const H1: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 26,
  fontWeight: 600,
  margin: "0 0 8px",
};
const MUTED: React.CSSProperties = { fontSize: 14, color: "#7a6852", lineHeight: 1.5 };
const BTN: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#faf7f2", padding: "1px 16px" }}>
      <div style={CARD}>{children}</div>
    </div>
  );
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!mcpGloballyEnabled()) redirect("/admin");

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params.set(k, v);

  const session = await getAdminSession();
  if (!session) redirect(`/admin/login?callbackUrl=${encodeURIComponent(`/admin/oauth/consent?${params}`)}`);

  const v = await validateAuthorizeParams(params);
  if (!v.ok) {
    return (
      <Shell>
        <h1 style={H1}>Can&apos;t connect this app</h1>
        <p style={MUTED}>{v.ok === false && !v.redirectable ? v.error : v.description}</p>
      </Shell>
    );
  }

  const tenantId = session.tenantId
    ?? (await prisma.adminUser.findUnique({ where: { id: session.id }, select: { tenantId: true } }))?.tenantId;
  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
    : null;
  const enabled = tenantId ? await isTenantMcpEnabled(tenantId) : false;
  const appName = v.value.clientName || "An AI assistant";
  const redirectHost = new URL(v.value.redirectUri).hostname;

  if (!enabled) {
    return (
      <Shell>
        <h1 style={H1}>AI assistant access is off</h1>
        <p style={MUTED}>
          {appName} wants to connect to {tenant?.name ?? "your store"}, but AI assistant access is turned off.
          Turn it on in <a href="/admin/settings/ai" style={{ color: "#8B6914" }}>Settings → AI Assistants</a>, then try connecting again.
        </p>
      </Shell>
    );
  }

  const readOnlyRequested = v.value.requestedScope === "mcp:read";

  return (
    <Shell>
      <h1 style={H1}>Connect {appName}?</h1>
      <p style={MUTED}>
        <strong>{appName}</strong> ({redirectHost}) wants access to the <strong>{tenant?.name ?? "store"}</strong> admin
        as <strong>{session.email}</strong>.
      </p>
      <form method="POST" action="/oauth/authorize/decision" style={{ marginTop: 20 }}>
        {[...params.entries()].filter(([k]) => k !== "decision" && k !== "access").map(([k, val]) => (
          <input key={k} type="hidden" name={k} value={val} />
        ))}
        <fieldset style={{ border: "1px solid #ede8df", borderRadius: 8, padding: "12px 14px", margin: "0 0 16px" }}>
          <legend style={{ fontSize: 13, fontWeight: 600, padding: "0 6px" }}>Access</legend>
          {!readOnlyRequested && (
            <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
              <input type="radio" name="access" value="full" defaultChecked /> Full access: view and make changes.
              Refunds, emails and other changes still need your yes in the chat every time.
            </label>
          )}
          <label style={{ display: "block", fontSize: 14 }}>
            <input type="radio" name="access" value="read" defaultChecked={readOnlyRequested} /> Read-only: view only, no changes.
          </label>
        </fieldset>
        <p style={{ ...MUTED, fontSize: 12 }}>
          You can turn off AI assistant access at any time in Settings → AI Assistants.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="submit" name="decision" value="allow" style={{ ...BTN, background: "#8B6914", color: "#fff" }}>
            Allow
          </button>
          <button type="submit" name="decision" value="deny" style={{ ...BTN, background: "#f0ebe0", color: "#5a4a38" }}>
            Deny
          </button>
        </div>
      </form>
    </Shell>
  );
}
