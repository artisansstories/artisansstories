"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Stripe Connect — refresh landing (O2).
 *
 * Where Stripe redirects when an onboarding link has expired or the merchant
 * needs a fresh one. The default `refreshUrl` of `POST .../connect` points here
 * when no override is supplied. We simply re-mint a link and send them back in.
 */

const ACCENT = "#3D4F7C";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};

const btn: React.CSSProperties = {
  padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer",
  background: ACCENT, color: "#fff", fontWeight: 600, fontSize: 14,
  textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
};

const btnGhost: React.CSSProperties = {
  ...btn,
  background: "transparent", color: ACCENT, border: "1px solid rgba(61,79,124,0.35)",
};

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14, borderRadius: "50%",
      border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

export default function StripeConnectRefreshPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-mint an onboarding link via POST .../connect {} and redirect into Stripe.
  // Handles the StripeConnectError JSON shape: { error: code, message }.
  const getNewLink = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${id}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create a new Stripe link");
      setLoading(false);
    }
  }, [id]);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <a href={`/platform/tenants/${id}`} style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>← Back to tenant</a>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#222b40", margin: "16px 0 4px" }}>Stripe Connect</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 20 }}>Onboarding link refresh</p>

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", padding: 16, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={card}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#222b40", marginBottom: 8 }}>
          Your Stripe setup link expired
        </h2>
        <p style={{ color: "#5a6478", fontSize: 14, lineHeight: 1.5 }}>
          Stripe onboarding links are single-use and time-limited. Get a fresh link
          to pick up where you left off — nothing already entered is lost.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
          <button style={btn} onClick={getNewLink} disabled={loading}>
            {loading ? <><Spinner /> Getting a new link…</> : "Get a new link"}
          </button>
          <a href={`/platform/tenants/${id}`} style={btnGhost}>Back to tenant →</a>
        </div>
      </div>

      <style>{`
        a:hover { text-decoration: underline; }
        @keyframes spin { to { transform: rotate(360deg); } }
        button:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </div>
  );
}
