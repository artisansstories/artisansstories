"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Stripe Connect — return landing (O2).
 *
 * Where Stripe redirects the merchant after they finish (or exit) the Connect
 * onboarding flow. The default `returnUrl` of `POST .../connect` points here when
 * no override is supplied (i.e. connect was kicked off from the tenant detail page).
 *
 * On mount it GETs `stripe-status` (which syncs `stripeOnboarded` server-side),
 * then polls every 5s for up to ~60s, stopping early on a terminal state. The
 * onward "Continue onboarding →" link targets the wizard (lands in O3).
 */

const ACCENT = "#3D4F7C";

interface StripeStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboarded: boolean;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 12; // ~60s

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
      border: "2px solid rgba(61,79,124,0.25)", borderTopColor: ACCENT,
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

export default function StripeConnectReturnPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [resuming, setResuming] = useState(false);

  const pollCount = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  // A status is "terminal" when there's nothing left to wait for: either the
  // account can charge, or Stripe says details were submitted (now in review).
  const isTerminal = useCallback((s: StripeStatus) => s.chargesEnabled || s.detailsSubmitted, []);

  // Fetch once. Returns the status (or null on no-account / error) so the poll
  // loop can decide whether to keep going.
  const fetchStatus = useCallback(async (): Promise<StripeStatus | null> => {
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${id}/stripe-status`);
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        if (body.error === "no_connected_account") {
          setNoAccount(true);
          return null;
        }
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      const s: StripeStatus = await res.json();
      setNoAccount(false);
      setStatus(s);
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to check Stripe status");
      return null;
    }
  }, [id]);

  // The poll loop: schedule the next tick only while non-terminal and under cap.
  const scheduleNext = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(async () => {
      pollCount.current += 1;
      const s = await fetchStatus();
      if (!s || isTerminal(s) || pollCount.current >= MAX_POLLS) {
        setPolling(false);
        clearTimer();
      } else {
        scheduleNext();
      }
    }, POLL_INTERVAL_MS);
  }, [clearTimer, fetchStatus, isTerminal]);

  // Initial load + start polling if not yet terminal.
  const start = useCallback(async () => {
    setLoading(true);
    pollCount.current = 0;
    clearTimer();
    const s = await fetchStatus();
    setLoading(false);
    if (s && !isTerminal(s)) {
      setPolling(true);
      scheduleNext();
    } else {
      setPolling(false);
    }
  }, [clearTimer, fetchStatus, isTerminal, scheduleNext]);

  useEffect(() => {
    void start();
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // "Check again" — a one-shot GET (no polling restart), for the review state.
  const checkAgain = useCallback(async () => {
    setLoading(true);
    await fetchStatus();
    setLoading(false);
  }, [fetchStatus]);

  // Re-mint an onboarding link and send the merchant back into Stripe.
  const resumeSetup = useCallback(async () => {
    setResuming(true);
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
      setError(e instanceof Error ? e.message : "Failed to start Stripe setup");
      setResuming(false);
    }
  }, [id]);

  const onwardLinks = (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
      <a href={`/platform/onboarding/${id}`} style={btn}>Continue onboarding →</a>
      <a href={`/platform/tenants/${id}`} style={btnGhost}>Back to tenant →</a>
    </div>
  );

  function Body() {
    if (loading && !status && !noAccount) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#7a8296" }}>
          <Spinner /> Checking Stripe status…
        </div>
      );
    }

    if (noAccount) {
      return (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#222b40", marginBottom: 8 }}>
            No Stripe account is attached yet
          </h2>
          <p style={{ color: "#5a6478", fontSize: 14, lineHeight: 1.5 }}>
            This tenant has no connected Stripe account. Start setup to create one and
            begin onboarding.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
            <button style={btn} onClick={resumeSetup} disabled={resuming}>
              {resuming ? <><Spinner /> Starting…</> : "Start Stripe setup"}
            </button>
            <a href={`/platform/tenants/${id}`} style={btnGhost}>Back to tenant →</a>
          </div>
        </>
      );
    }

    // chargesEnabled → fully onboarded.
    if (status?.chargesEnabled) {
      return (
        <>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px",
            borderRadius: 999, background: "rgba(28,124,74,0.12)", color: "#1c7c4a",
            fontWeight: 700, fontSize: 14, marginBottom: 14,
          }}>
            ✓ Stripe onboarded
          </div>
          <p style={{ color: "#3c4658", fontSize: 15, lineHeight: 1.5 }}>
            This store can accept payments.
          </p>
          {onwardLinks}
        </>
      );
    }

    // detailsSubmitted but not charges_enabled → in review.
    if (status?.detailsSubmitted) {
      return (
        <>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px",
            borderRadius: 999, background: "rgba(184,124,20,0.14)", color: "#9a6a12",
            fontWeight: 700, fontSize: 14, marginBottom: 14,
          }}>
            ⏳ Stripe is reviewing this account
          </div>
          <p style={{ color: "#3c4658", fontSize: 15, lineHeight: 1.5 }}>
            Stripe is reviewing this account — usually just a few minutes. You can
            continue onboarding and come back.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
            <button style={btnGhost} onClick={checkAgain} disabled={loading}>
              {loading ? <><Spinner /> Checking…</> : "Check again"}
            </button>
            <a href={`/platform/onboarding/${id}`} style={btn}>Continue onboarding →</a>
            <a href={`/platform/tenants/${id}`} style={btnGhost}>Back to tenant →</a>
          </div>
        </>
      );
    }

    // No charges, no details submitted → onboarding wasn't finished.
    if (status && !status.detailsSubmitted) {
      return (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#222b40", marginBottom: 8 }}>
            Onboarding wasn&apos;t finished
          </h2>
          <p style={{ color: "#5a6478", fontSize: 14, lineHeight: 1.5 }}>
            Stripe didn&apos;t record a completed application. Resume setup to pick up
            where you left off.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
            <button style={btn} onClick={resumeSetup} disabled={resuming}>
              {resuming ? <><Spinner /> Starting…</> : "Resume Stripe setup"}
            </button>
            <a href={`/platform/tenants/${id}`} style={btnGhost}>Back to tenant →</a>
          </div>
        </>
      );
    }

    // Error with no status to show.
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button style={btn} onClick={checkAgain} disabled={loading}>
          {loading ? <><Spinner /> Checking…</> : "Try again"}
        </button>
        <a href={`/platform/tenants/${id}`} style={btnGhost}>Back to tenant →</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <a href={`/platform/tenants/${id}`} style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>← Back to tenant</a>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#222b40", margin: "16px 0 4px" }}>Stripe Connect</h1>
      <p style={{ color: "#7a8296", fontSize: 14, marginBottom: 20 }}>Onboarding return</p>

      {polling && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#7a8296", fontSize: 13, marginBottom: 12 }}>
          <Spinner /> Checking Stripe status…
        </div>
      )}

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", padding: 16, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={card}>
        <Body />
      </div>

      <style>{`
        a:hover { text-decoration: underline; }
        @keyframes spin { to { transform: rotate(360deg); } }
        button:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </div>
  );
}
