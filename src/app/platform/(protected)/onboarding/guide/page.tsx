import { redirect } from "next/navigation";
import { getPlatformSession } from "@/lib/platform-session";

/**
 * Onboarding Guide (O4) — the operator handbook.
 *
 * A single, scannable, STATIC reference documenting the whole onboarding
 * "process train" so any operator (or a new teammate) understands it without
 * running it. No data fetching, no client interactivity — a server component
 * that renders the same source-of-truth the wizard executes, in prose.
 *
 * Operator-gated: the (protected) layout already redirects to /platform/login
 * when there is no operator session; we re-assert it here (defense in depth and
 * the established pattern for protected server pages).
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
const liStyle: React.CSSProperties = { color: "#3c4658", fontSize: 14, lineHeight: 1.6, marginBottom: 6 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", color: MUTED, fontSize: 12, fontWeight: 700, borderBottom: "1px solid rgba(45,59,85,0.12)" };
const td: React.CSSProperties = { padding: "9px 10px", fontSize: 13.5, color: "#3c4658", borderBottom: "1px solid rgba(45,59,85,0.06)", verticalAlign: "top" };

function Code({ children }: { children: React.ReactNode }) {
  return <code style={{ background: "rgba(45,59,85,0.07)", borderRadius: 5, padding: "1px 6px", fontSize: 13, color: "#2c3654" }}>{children}</code>;
}

const STEPS: { num: number; title: string; blurb: string }[] = [
  { num: 1, title: "Create store", blurb: "A tenant row plus its default theme and store settings. From this point the store has a slug and a hosted home at /t/{slug}." },
  { num: 2, title: "Branding", blurb: "Colours, fonts, radius, logo — optional and non-blocking. Skip it and the store ships with sensible platform defaults." },
  { num: 3, title: "Stripe Connect", blurb: "Standard Connect so the merchant is the merchant-of-record. The one async, merchant-owned step. Required to go live." },
  { num: 4, title: "Products", blurb: "At least one product so the store isn't empty. Inline minimal create, or the full admin via an audited impersonation session." },
  { num: 5, title: "API key", blurb: "A scoped key for embedding the store into the merchant's own site. Shown exactly once. The hosted store sells without one." },
  { num: 6, title: "Integration", blurb: "An auto-generated, per-tenant integration page — the shippable artifact the merchant receives. Generatable once a key exists." },
  { num: 7, title: "Go live", blurb: "Flips the tenant's storeEnabled. Gated on Stripe onboarded AND ≥1 product. The store becomes publicly sellable." },
];

export default async function OnboardingGuidePage() {
  const operator = await getPlatformSession();
  if (!operator) redirect("/platform/login");

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <a href="/platform/onboarding" style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>← Onboarding</a>

      <h1 style={{ fontSize: 27, fontWeight: 700, color: INK, margin: "14px 0 6px" }}>Onboarding Guide</h1>
      <p style={{ color: MUTED, fontSize: 14.5, marginBottom: 24, lineHeight: 1.55, maxWidth: 660 }}>
        The operator handbook for the onboarding process train — how a store goes from <strong>nothing</strong> to a
        <strong> live, sellable storefront</strong>, and what each step does. Reference it any time; run the train at{" "}
        <a href="/platform/onboarding" style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}>/platform/onboarding</a>.
      </p>

      {/* Overview */}
      <section style={card}>
        <h2 style={h2}>Overview — the 7-step train</h2>
        <p style={lede}>
          An ordered, opinionated path. Every step&apos;s completion is <em>derived</em> from data that already exists,
          so closing the laptop and resuming next week always lands on the right step — there is nothing to &ldquo;save.&rdquo;
          Steps are freely navigable; only <strong>Go live</strong> is gated.
        </p>
        <ol style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {STEPS.map((s) => (
            <li key={s.num} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: ACCENT, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{s.num}</span>
              <span>
                <span style={{ fontWeight: 700, color: INK, fontSize: 14.5 }}>{s.title}</span>
                <span style={{ display: "block", color: "#3c4658", fontSize: 13.5, lineHeight: 1.55 }}>{s.blurb}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Before you start */}
      <section style={card}>
        <h2 style={h2}>Before you start</h2>
        <p style={lede}>Have these ready and the run is friction-free end to end:</p>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={liStyle}><strong>Store name</strong> — the slug auto-suggests from it (editable, must be unique).</li>
          <li style={liStyle}><strong>The merchant&apos;s Stripe situation</strong> — brand-new, or an existing <Code>acct_…</Code> to reuse (the instant path).</li>
          <li style={liStyle}><strong>Brand colours / logo</strong> — primary, secondary, accent, fonts, and a logo or favicon to upload (optional — defaults are fine).</li>
          <li style={liStyle}><strong>At least one product</strong> — name + price is enough to satisfy the gate; richer editing comes later.</li>
          <li style={liStyle}><strong>Where the storefront embeds</strong> — the merchant&apos;s own site (API), or just the hosted <Code>/t/{"{slug}"}</Code> store.</li>
        </ul>
      </section>

      {/* Stripe deep-dive */}
      <section style={card}>
        <h2 style={h2}>Stripe Connect — the deep dive</h2>
        <p style={lede}>The single hardest step, because it&apos;s async and the merchant owns it. Designed so the train never traps you waiting.</p>
        <p style={p}>
          We use <strong>Standard Connect</strong>: the <strong>merchant is the merchant-of-record</strong>. KYC (identity,
          bank, tax) is the <strong>merchant&apos;s legal responsibility</strong> and is <strong>asynchronous</strong> — it can take
          minutes to days. The platform never holds the merchant&apos;s money; it takes a small fee per sale.
        </p>
        <p style={{ ...p, marginBottom: 8, fontWeight: 700, color: INK }}>Three paths, lowest friction first:</p>
        <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={liStyle}><strong>Reuse an existing account</strong> — paste an <Code>acct_…</Code>; if it can already charge, the step is <span style={{ color: GREEN, fontWeight: 600 }}>instantly green</span>. (The fast path for Orange Slice Sport.)</li>
          <li style={liStyle}><strong>Onboard now</strong> — you, at the keyboard. Opens Stripe in a new tab; on return the wizard auto-polls and detects completion.</li>
          <li style={liStyle}><strong>Hand off to the merchant</strong> — share a link; they finish KYC on their own time. The step shows <span style={{ color: AMBER, fontWeight: 600 }}>in progress</span> and the train keeps moving.</li>
        </ul>
        <p style={p}>
          <strong>&ldquo;Details submitted but not charges_enabled&rdquo;</strong> means the merchant finished the application and
          Stripe is <em>reviewing</em> it — usually a few minutes. Don&apos;t block: continue to Products / API key and circle back;
          the step flips to onboarded automatically when <Code>charges_enabled</Code> turns true.
        </p>
        <p style={{ ...p, marginBottom: 0 }}>
          <strong>Platform fee</strong> is <Code>platformFeeBps</Code> in <strong>basis points</strong> (1 bp = 0.01%). The default{" "}
          <Code>300</Code> = 3% taken per sale. Set it per store at create time (Advanced).
        </p>
      </section>

      {/* API keys */}
      <section style={card}>
        <h2 style={h2}>API keys</h2>
        <p style={lede}>Scoped bearer tokens that authenticate the merchant&apos;s own site against the v1 API.</p>
        <div style={{ overflowX: "auto", marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={th}>Scope</th><th style={th}>Grants</th></tr>
            </thead>
            <tbody>
              <tr><td style={td}><Code>store:read</Code></td><td style={td}>Read theme, products, categories, orders. CORS-enabled — safe from the browser.</td></tr>
              <tr><td style={td}><Code>store:write</Code></td><td style={td}>Mutating store operations (reserved for richer integrations).</td></tr>
              <tr><td style={td}><Code>checkout:create</Code></td><td style={td}>Create Stripe-hosted checkout sessions. <strong>Server-side only</strong> — never ship to the browser.</td></tr>
            </tbody>
          </table>
        </div>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={liStyle}><strong>Live vs test</strong> — defaults to <strong>live</strong> (onboarding&apos;s goal is a sellable store). A test toggle covers sandbox work; a test key can&apos;t transact.</li>
          <li style={liStyle}><strong>Shown once</strong> — the raw key appears exactly once, right after minting. Only the <strong>prefix</strong> is recoverable afterward.</li>
          <li style={liStyle}><strong>Rotation / revocation</strong> — keys can be revoked any time; mint a fresh one and update the merchant. The integration page always shows the latest active prefix.</li>
          <li style={liStyle}><strong>Never ship <Code>checkout:create</Code> to the browser</strong> — proxy checkout calls through the merchant&apos;s backend.</li>
        </ul>
      </section>

      {/* Going live */}
      <section style={card}>
        <h2 style={h2}>Going live</h2>
        <p style={lede}>The final, gated step. It is the only thing that controls public visibility.</p>
        <p style={p}>
          <strong>Prerequisites (enforced server-side):</strong> Stripe <strong>onboarded</strong> AND <strong>at least one product</strong>.
          An API key is <em>recommended</em> but not required — the hosted store sells without one. Branding is optional.
        </p>
        <p style={p}>
          <strong>What <Code>storeEnabled</Code> does:</strong> going live flips the tenant&apos;s own{" "}
          <Code>StoreSettings.storeEnabled = true</Code>. The store is then publicly sellable. (Un-publishing flips it back.)
        </p>
        <p style={{ ...p, marginBottom: 0 }}>
          <strong>Two ways to surface the store:</strong> the ready-made hosted storefront at <Code>/t/{"{slug}"}</Code>
          {" "}(themed, no code), or <strong>API embedding</strong> into the merchant&apos;s own site via the integration page.
        </p>
      </section>

      {/* Troubleshooting */}
      <section style={card}>
        <h2 style={h2}>Troubleshooting</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={liStyle}><strong>Slug taken (409)</strong> — slugs are globally unique. Pick another (the launcher suggests <Code>slug-2</Code>).</li>
          <li style={liStyle}><strong>Stripe stuck pending</strong> — <Code>details_submitted</Code> without <Code>charges_enabled</Code> means Stripe is still reviewing. Wait a few minutes and &ldquo;Check again&rdquo;; continue other steps meanwhile.</li>
          <li style={liStyle}><strong>409 <Code>tenant_stripe_not_onboarded</Code> on checkout</strong> — the tenant hasn&apos;t finished Stripe. Checkout sessions can&apos;t be created until Stripe is onboarded; finish step 3.</li>
          <li style={liStyle}><strong>Rate limits (429)</strong> — the v1 API is limited to <strong>120 requests/min</strong> per key. Honor the <Code>Retry-After</Code> header and back off.</li>
        </ul>
      </section>

      <style>{`a:hover { text-decoration: underline !important; }`}</style>
    </div>
  );
}
