import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPlatformSession } from "@/lib/platform-session";
import { prisma } from "@/lib/prisma";
import CodeBlock from "./_CodeBlock";

/**
 * Per-tenant Integration page (O4) — the shippable artifact the merchant receives.
 *
 * This is INTEGRATION_PLAYBOOK.md with every placeholder resolved for THIS tenant:
 * base URL, slug, the API key PREFIX (never the secret — that was shown once at
 * mint), hosted store URL, the API table and curl examples with the real slug
 * substituted. Server component; reads via raw prisma behind the operator gate.
 *
 * Operator-gated: the (protected) layout redirects unauthenticated requests to
 * /platform/login; we re-assert it here (the established protected-server-page
 * pattern). No new API route — it reads Tenant + latest active TenantApiKey directly.
 */

const ACCENT = "#3D4F7C";
const GREEN = "#1c7c4a";
const AMBER = "#9a6a12";
const MUTED = "#7a8296";
const INK = "#222b40";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: INK, marginBottom: 6 };
const lede: React.CSSProperties = { color: MUTED, fontSize: 13.5, marginBottom: 16, lineHeight: 1.55 };
const p: React.CSSProperties = { color: "#3c4658", fontSize: 14, lineHeight: 1.6, marginBottom: 12 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", color: MUTED, fontSize: 12, fontWeight: 700, borderBottom: "1px solid rgba(45,59,85,0.12)" };
const td: React.CSSProperties = { padding: "9px 10px", fontSize: 13, color: "#3c4658", borderBottom: "1px solid rgba(45,59,85,0.06)", verticalAlign: "top" };
const link: React.CSSProperties = { color: ACCENT, fontWeight: 600, textDecoration: "none" };

function Code({ children }: { children: React.ReactNode }) {
  return <code style={{ background: "rgba(45,59,85,0.07)", borderRadius: 5, padding: "1px 6px", fontSize: 13, color: "#2c3654", wordBreak: "break-all" }}>{children}</code>;
}

function CredRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid rgba(45,59,85,0.06)" }}>
      <span style={{ color: MUTED, fontSize: 13, minWidth: 120, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 14, color: INK }}>{children}</span>
    </div>
  );
}

const API_TABLE: { method: string; path: string; scope: string; purpose: string }[] = [
  { method: "GET", path: "/api/v1/store/theme", scope: "store:read", purpose: "Branding (colors, fonts, logo, radius) — apply it so the store matches the site DNA" },
  { method: "GET", path: "/api/v1/store/products", scope: "store:read", purpose: "Product list. Query: category, q, tags, minPrice, maxPrice, sort, page, limit" },
  { method: "GET", path: "/api/v1/store/products/{slug}", scope: "store:read", purpose: "Full product detail (variants, options, images, addons)" },
  { method: "GET", path: "/api/v1/store/products/featured", scope: "store:read", purpose: "Curated featured products for tasteful interlaced placements" },
  { method: "GET", path: "/api/v1/store/categories", scope: "store:read", purpose: "Category list with product counts" },
  { method: "POST", path: "/api/v1/store/checkout/session", scope: "checkout:create", purpose: "Create a Stripe-hosted checkout session → redirect the buyer to url" },
  { method: "GET", path: "/api/v1/store/orders/{id}", scope: "store:read", purpose: "Order status after checkout" },
];

export default async function TenantIntegrationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const operator = await getPlatformSession();
  if (!operator) redirect("/platform/login");

  const { id } = await params;

  const [tenant, latestKey] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, platformFeeBps: true, stripeOnboarded: true },
    }),
    prisma.tenantApiKey.findFirst({
      where: { tenantId: id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { prefix: true, scopes: true, name: true },
    }),
  ]);

  if (!tenant) notFound();

  // Base URL: explicit env override wins; else derive from the request host.
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${proto}://${host}` : "https://artisansstories.com");

  const hostedUrl = `${baseUrl}/t/${tenant.slug}`;
  const scopes = latestKey?.scopes ?? ["store:read", "checkout:create"];
  const keyPrefix = latestKey?.prefix ?? null;

  const curlTheme = `curl -s ${baseUrl}/api/v1/store/theme \\
  -H "Authorization: Bearer $KEY"`;
  const curlProducts = `curl -s "${baseUrl}/api/v1/store/products?limit=12&sort=featured" \\
  -H "Authorization: Bearer $KEY"`;
  const curlDetail = `curl -s ${baseUrl}/api/v1/store/products/<product-slug> \\
  -H "Authorization: Bearer $KEY"`;
  const curlCheckout = `curl -s -X POST ${baseUrl}/api/v1/store/checkout/session \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "items": [{ "variantId": "<variant-id-from-product>", "quantity": 1 }],
    "successUrl": "https://your-site.com/store/thanks?session={CHECKOUT_SESSION_ID}",
    "cancelUrl":  "https://your-site.com/store/cart"
  }'`;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <a href={`/platform/tenants/${tenant.id}`} style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>← Back to tenant</a>

      <h1 style={{ fontSize: 27, fontWeight: 700, color: INK, margin: "14px 0 6px" }}>{tenant.name} — Integration Guide</h1>
      <p style={{ color: MUTED, fontSize: 14.5, marginBottom: 24, lineHeight: 1.55, maxWidth: 660 }}>
        The shippable artifact for this store — base URL, slug, API key prefix, the API surface and copy-paste{" "}
        <Code>curl</Code> examples, all resolved for <strong>{tenant.name}</strong>. Hand this to the integrating developer.
      </p>

      {/* Credentials */}
      <section style={card}>
        <h2 style={h2}>Credentials</h2>
        <p style={lede}>Send the key as a Bearer header on every request: <Code>Authorization: Bearer &lt;key&gt;</Code></p>
        <CredRow label="Base URL"><Code>{baseUrl}</Code></CredRow>
        <CredRow label="Tenant slug"><Code>{tenant.slug}</Code></CredRow>
        <CredRow label="API key prefix">
          {keyPrefix ? (
            <>
              <Code>{keyPrefix}…</Code>{" "}
              <span style={{ color: MUTED, fontSize: 12.5 }}>— the full key was shown once at creation. Rotate (re-mint) if lost.</span>
            </>
          ) : (
            <span style={{ color: AMBER, fontSize: 13.5 }}>No active key yet — mint one in onboarding step 5 (or the Tenants list).</span>
          )}
        </CredRow>
        <CredRow label="Scopes">
          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
            {scopes.map((s) => <Code key={s}>{s}</Code>)}
          </span>
        </CredRow>
        <CredRow label="Hosted store">
          <a href={hostedUrl} target="_blank" rel="noopener" style={link}>{hostedUrl}</a>
        </CredRow>
        <CredRow label="Platform fee">{(tenant.platformFeeBps / 100).toFixed(2)}% per sale</CredRow>
        <p style={{ ...lede, margin: "14px 0 0" }}>
          Keys can be revoked/rotated any time. Never ship a <Code>checkout:create</Code> key in client-side code — proxy
          checkout through the merchant&apos;s backend. <Code>store:read</Code> GETs are CORS-enabled and browser-safe.
        </p>
      </section>

      {/* The API */}
      <section style={card}>
        <h2 style={h2}>The API (v1)</h2>
        <p style={lede}>
          Full machine-readable spec: <a href="/api/v1/openapi.json" target="_blank" rel="noopener" style={link}>/api/v1/openapi.json</a>{" "}
          · Interactive docs: <a href="/api/v1/docs" target="_blank" rel="noopener" style={link}>Swagger UI →</a>
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={th}>Method</th><th style={th}>Path</th><th style={th}>Scope</th><th style={th}>Purpose</th></tr>
            </thead>
            <tbody>
              {API_TABLE.map((r) => (
                <tr key={r.method + r.path}>
                  <td style={{ ...td, fontWeight: 700, color: r.method === "POST" ? AMBER : GREEN }}>{r.method}</td>
                  <td style={td}><Code>{r.path}</Code></td>
                  <td style={td}><Code>{r.scope}</Code></td>
                  <td style={td}>{r.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ ...p, margin: "14px 0 0" }}>
          Prices are integer <strong>cents</strong> (e.g. <Code>5499</Code> = $54.99). Apply the <Code>theme</Code> values as CSS
          variables so the store inherits the brand.
        </p>
      </section>

      {/* curl examples */}
      <section style={card}>
        <h2 style={h2}>Examples</h2>
        <p style={lede}>Set <Code>KEY</Code> to this store&apos;s API key, then:</p>

        <p style={{ ...p, fontWeight: 700, color: INK, marginBottom: 4 }}>1. Theme — apply these to the store section</p>
        <CodeBlock code={curlTheme} />

        <p style={{ ...p, fontWeight: 700, color: INK, marginBottom: 4 }}>2. Products</p>
        <CodeBlock code={curlProducts} />

        <p style={{ ...p, fontWeight: 700, color: INK, marginBottom: 4 }}>3. Product detail</p>
        <CodeBlock code={curlDetail} />

        <p style={{ ...p, fontWeight: 700, color: INK, marginBottom: 4 }}>4. Checkout session (server-side only)</p>
        <CodeBlock code={curlCheckout} />
      </section>

      {/* Checkout */}
      <section style={card}>
        <h2 style={h2}>Checkout (Stripe-hosted redirect)</h2>
        <p style={p}>
          Call <Code>POST /api/v1/store/checkout/session</Code> from the merchant&apos;s backend (keeps the key server-side).
          It returns <Code>{`{ ok:true, mode:"connect_redirect", url:"https://checkout.stripe.com/…" }`}</Code> — redirect the
          buyer to <Code>url</Code>. They pay on Stripe (the merchant is the merchant-of-record), then return to the{" "}
          <Code>successUrl</Code>. The server never trusts client-sent prices — amounts are computed from the database.
        </p>
        <p style={{ ...p, marginBottom: 0 }}>
          <strong>Prerequisite:</strong> this tenant must have completed Stripe Connect onboarding{" "}
          {tenant.stripeOnboarded
            ? <span style={{ color: GREEN, fontWeight: 600 }}>(✓ onboarded — checkout is live)</span>
            : <span style={{ color: AMBER, fontWeight: 600 }}>(⏳ not onboarded yet — finish Stripe in onboarding step 3)</span>}.
          Until then, checkout returns <Code>409 {`{ ok:false, error:"tenant_stripe_not_onboarded" }`}</Code>.
        </p>
      </section>

      {/* Option B */}
      <section style={card}>
        <h2 style={h2}>Option B — just link to the hosted store</h2>
        <p style={{ ...p, marginBottom: 8 }}>
          If the merchant doesn&apos;t want to build UI yet, point their &ldquo;Team Store&rdquo; tab straight at the ready-made,
          fully-themed storefront:
        </p>
        <a href={hostedUrl} target="_blank" rel="noopener" style={link}>{hostedUrl}</a>
      </section>

      {/* Errors & limits */}
      <section style={card}>
        <h2 style={h2}>Errors &amp; limits</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ color: "#3c4658", fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}><Code>401</Code> missing/invalid/revoked key · <Code>403</Code> key lacks the required scope · <Code>404</Code> not found in this tenant</li>
          <li style={{ color: "#3c4658", fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}><Code>409</Code> checkout when Stripe not onboarded · <Code>429</Code> rate limited (<strong>120 req/min</strong>; honor <Code>Retry-After</Code>)</li>
          <li style={{ color: "#3c4658", fontSize: 14, lineHeight: 1.6 }}>Errors are JSON: <Code>{`{ error: "<machine_code>", message?: "<human>" }`}</Code></li>
        </ul>
      </section>

      <style>{`a:hover { text-decoration: underline !important; }`}</style>
    </div>
  );
}
