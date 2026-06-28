"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  DEFAULT_THEME,
  FONT_ALLOWLIST,
  RADIUS_ALLOWLIST,
  radiusToken,
  readableText,
  type ThemeValue,
} from "@/lib/theme";

/**
 * The Onboarding "Process Train" (O3) — a resumable, step-rail wizard at
 * `/platform/onboarding/[tenantId]`.
 *
 * Everything is DERIVED: on mount and after every mutating action the wizard
 * re-fetches `GET /api/platform/tenants/[id]/onboarding-status` (the single
 * source of truth, O1) and re-renders the rail + active step from it. There is
 * nothing to persist — closing the laptop and resuming next week lands on the
 * right step because the truth is the data itself.
 *
 * Free navigation between steps (click any pill); only Go Live is gated, and it
 * is gated by a disabled button whose prerequisites are re-checked server-side.
 *
 * Deep links:  ?step=<id>   lands on a specific step.
 *              ?stripe=return|refresh   on the Stripe step drives the O2 poll.
 */

const ACCENT = "#3D4F7C";
const GREEN = "#1c7c4a";
const GREEN_BG = "rgba(28,124,74,0.12)";
const AMBER = "#9a6a12";
const AMBER_BG = "rgba(184,124,20,0.14)";
const MUTED = "#8a93a6";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 12; // ~60s, matches O2

type StepId =
  | "create"
  | "branding"
  | "stripe"
  | "products"
  | "apiKey"
  | "integration"
  | "goLive";

const STEPS: { id: StepId; label: string; num: number }[] = [
  { id: "create", label: "Create", num: 1 },
  { id: "branding", label: "Branding", num: 2 },
  { id: "stripe", label: "Stripe", num: 3 },
  { id: "products", label: "Products", num: 4 },
  { id: "apiKey", label: "API Key", num: 5 },
  { id: "integration", label: "Integration", num: 6 },
  { id: "goLive", label: "Go Live", num: 7 },
];
const STEP_IDS = STEPS.map((s) => s.id) as StepId[];

interface OnboardingStatus {
  tenantId: string;
  slug: string;
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
  currentStep: StepId | "complete";
  completedCount: number;
  total: number;
}

interface StripeStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboarded: boolean;
}

/* ── shared styles ──────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 24,
};
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 4 };
const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)", fontSize: 14,
};
const btn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer",
  background: ACCENT, color: "#fff", fontWeight: 600, fontSize: 14,
  textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
};
const btnGhost: React.CSSProperties = {
  ...btn, background: "transparent", color: ACCENT, border: "1px solid rgba(61,79,124,0.35)",
};
const microcopy: React.CSSProperties = { color: "#7a8296", fontSize: 13, lineHeight: 1.5, marginTop: 10 };

/* ── small reusable pieces ──────────────────────────────────────────────── */

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14, borderRadius: "50%",
      border: `2px solid ${light ? "rgba(255,255,255,0.4)" : "rgba(61,79,124,0.25)"}`,
      borderTopColor: light ? "#fff" : ACCENT, animation: "spin 0.7s linear infinite",
    }} />
  );
}

function CopyButton({ value, label: lbl = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
      }}
      style={{ ...btnGhost, padding: "6px 12px", fontSize: 13 }}
    >
      {copied ? "Copied ✓" : lbl}
    </button>
  );
}

function Pill({ on, label: lbl, recommended }: { on: boolean; label: string; recommended?: boolean }) {
  const colour = on ? GREEN : recommended ? AMBER : "#9a3838";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: colour }}>
      <span>{on ? "✓" : recommended ? "○" : "✗"}</span> {lbl}
    </span>
  );
}

/* ── the wizard shell ───────────────────────────────────────────────────── */

export default function OnboardingWizardPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<StepId>("create");
  const [origin, setOrigin] = useState("");

  // Stripe deep-link mode, read once from the URL (?stripe=return|refresh).
  const [stripeMode, setStripeMode] = useState<"return" | "refresh" | null>(null);

  const fetchStatus = useCallback(async (): Promise<OnboardingStatus | null> => {
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/onboarding-status`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      const s: OnboardingStatus = await res.json();
      setStatus(s);
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load onboarding status");
      return null;
    }
  }, [tenantId]);

  // Re-fetch after every mutation so the rail / progress stay live.
  const refresh = useCallback(async () => { await fetchStatus(); }, [fetchStatus]);

  const navigateTo = useCallback((step: StepId) => {
    setActiveStep(step);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `?step=${step}`);
    }
  }, []);

  // Mount: read query, fetch status + tenant name, land on the right step.
  useEffect(() => {
    setOrigin(window.location.origin);
    const q = new URLSearchParams(window.location.search);
    const stepParam = q.get("step");
    const stripeParam = q.get("stripe");
    setStripeMode(stripeParam === "return" ? "return" : stripeParam === "refresh" ? "refresh" : null);

    (async () => {
      setLoading(true);
      const s = await fetchStatus();
      // Tenant name for the header (best-effort; falls back to slug).
      try {
        const tRes = await fetch(`/api/platform/tenants/${tenantId}`);
        if (tRes.ok) { const t = await tRes.json(); setTenantName(t.name ?? ""); }
      } catch { /* non-fatal */ }

      if (s) {
        const initial =
          stepParam && (STEP_IDS as string[]).includes(stepParam)
            ? (stepParam as StepId)
            : s.currentStep === "complete"
              ? "goLive"
              : s.currentStep;
        setActiveStep(initial);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (loading && !status) {
    return (
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, color: MUTED }}>
        <Spinner /> Loading the train…
      </div>
    );
  }

  if (!status) {
    return (
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <a href="/platform/onboarding" style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>← Onboarding</a>
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", marginTop: 16 }}>
          {error ?? "This store could not be loaded."}
        </div>
      </div>
    );
  }

  const idx = STEP_IDS.indexOf(activeStep);
  const prevStep = idx > 0 ? STEPS[idx - 1].id : null;
  const nextStep = idx < STEPS.length - 1 ? STEPS[idx + 1].id : null;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <a href="/platform/onboarding" style={{ fontSize: 13, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>← Onboarding</a>

      <div style={{ margin: "14px 0 6px" }}>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: "#222b40" }}>{tenantName || status.slug}</h1>
        <p style={{ color: MUTED, fontSize: 14 }}>
          /t/{status.slug} · {status.storeEnabled ? "live ✓" : "onboarding"}
        </p>
      </div>

      {/* Header progress bar */}
      <div style={{ margin: "12px 0 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED, marginBottom: 6 }}>
          <span>Progress</span>
          <span>{status.completedCount}/{status.total}</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "rgba(45,59,85,0.10)", overflow: "hidden" }}>
          <div style={{ width: `${(status.completedCount / status.total) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${ACCENT}, #5B6EA8)`, transition: "width .3s" }} />
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: "rgba(200,40,40,0.4)", background: "rgba(200,40,40,0.06)", color: "#a01818", marginBottom: 16, padding: 16 }}>
          {error}
        </div>
      )}

      <div className="train-grid" style={{ display: "grid", gap: 20 }}>
        {/* Step rail */}
        <nav className="train-rail" style={{ display: "flex", gap: 8 }}>
          {STEPS.map((step) => (
            <RailPill
              key={step.id}
              step={step}
              status={status}
              active={step.id === activeStep}
              onClick={() => navigateTo(step.id)}
            />
          ))}
        </nav>

        {/* Active panel */}
        <div>
          <div style={card}>
            {activeStep === "create" && <CreateStep status={status} tenantName={tenantName} />}
            {activeStep === "branding" && <BrandingStep tenantId={tenantId} status={status} onRefresh={refresh} onSkip={() => navigateTo("stripe")} />}
            {activeStep === "stripe" && <StripeStep tenantId={tenantId} status={status} onRefresh={refresh} origin={origin} initialMode={stripeMode} />}
            {activeStep === "products" && <ProductsStep tenantId={tenantId} status={status} onRefresh={refresh} />}
            {activeStep === "apiKey" && <ApiKeyStep tenantId={tenantId} status={status} onRefresh={refresh} />}
            {activeStep === "integration" && <IntegrationStep tenantId={tenantId} status={status} origin={origin} />}
            {activeStep === "goLive" && <GoLiveStep tenantId={tenantId} status={status} onRefresh={refresh} origin={origin} />}
          </div>

          {/* Footer nav for momentum */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            {prevStep ? (
              <button style={btnGhost} onClick={() => navigateTo(prevStep)}>← {STEPS[idx - 1].label}</button>
            ) : <span />}
            {nextStep ? (
              <button style={btnGhost} onClick={() => navigateTo(nextStep)}>{STEPS[idx + 1].label} →</button>
            ) : <span />}
          </div>
        </div>
      </div>

      <style>{`
        a:hover { text-decoration: underline; }
        @keyframes spin { to { transform: rotate(360deg); } }
        button:disabled { opacity: 0.55; cursor: default; }
        .upload-zone:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
        .train-rail { flex-direction: row; overflow-x: auto; }
        @media (min-width: 860px) {
          .train-grid { grid-template-columns: 220px 1fr; align-items: start; }
          .train-rail { flex-direction: column !important; overflow-x: visible !important; position: sticky; top: 16px; }
        }
      `}</style>
    </div>
  );
}

/* ── rail pill ──────────────────────────────────────────────────────────── */

function RailPill({
  step, status, active, onClick,
}: { step: { id: StepId; label: string; num: number }; status: OnboardingStatus; active: boolean; onClick: () => void }) {
  const st = status.steps[step.id];
  // Derive the pill's visual kind from the aggregator.
  let kind: "done" | "amber" | "optional" | "ready" | "pending" = "pending";
  if (st.done) kind = "done";
  else if (step.id === "stripe" && status.steps.stripe.state === "in_progress") kind = "amber";
  else if (step.id === "branding") kind = "optional";
  else if (step.id === "goLive" && status.steps.goLive.blockedBy.length === 0) kind = "ready";

  const dotBg =
    kind === "done" ? GREEN
      : kind === "amber" ? AMBER
        : kind === "ready" ? ACCENT
          : "rgba(45,59,85,0.12)";
  const dotFg = kind === "pending" || kind === "optional" ? MUTED : "#fff";
  const dotContent = kind === "done" ? "✓" : kind === "amber" ? "●" : String(step.num);

  const sub =
    kind === "done" ? "done"
      : kind === "amber" ? "in progress"
        : kind === "optional" ? "optional"
          : kind === "ready" ? "ready"
            : active ? "current" : "pending";

  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        padding: "9px 12px", borderRadius: 10, cursor: "pointer", width: "100%",
        border: active ? `1.5px solid ${ACCENT}` : "1.5px solid transparent",
        background: active ? "rgba(61,79,124,0.08)" : "transparent",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <span style={{
        flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: dotBg, color: dotFg,
        display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
      }}>{dotContent}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: active ? 700 : 500, color: "#222b40" }}>{step.label}</span>
        <span style={{ display: "block", fontSize: 11, color: kind === "amber" ? AMBER : MUTED }}>{sub}</span>
      </span>
    </button>
  );
}

/* ── Step 1: Create ─────────────────────────────────────────────────────── */

function CreateStep({ status, tenantName }: { status: OnboardingStatus; tenantName: string }) {
  return (
    <div>
      <StepHeader num={1} title="Create store" />
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, background: GREEN_BG, color: GREEN, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
        ✓ Store created
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, fontSize: 14 }}>
        <div><span style={{ color: MUTED }}>Name</span><br />{tenantName || "—"}</div>
        <div><span style={{ color: MUTED }}>Slug</span><br /><code>{status.slug}</code></div>
        <div><span style={{ color: MUTED }}>Hosted at</span><br /><code>/t/{status.slug}</code></div>
      </div>

      {/* Store URL chip — the tenant's own subdomain. DNS + cert were provisioned
          at creation time; this is display-only (copyable). */}
      <div style={{ marginTop: 16 }}>
        <span style={{ color: MUTED, fontSize: 13 }}>Your store URL</span>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 6, marginLeft: 0, padding: "8px 14px", borderRadius: 999, background: "rgba(61,79,124,0.08)", border: "1px solid rgba(61,79,124,0.18)" }}>
          <code style={{ fontSize: 14, color: ACCENT, fontWeight: 600 }}>{status.slug}.artisansstories.com</code>
          <CopyButton value={`${status.slug}.artisansstories.com`} label="Copy" />
        </div>
      </div>

      <p style={microcopy}>
        The store, its default theme, and store settings already exist. Next: brand it, connect
        Stripe, add a product, mint a key — then take it live.
      </p>
    </div>
  );
}

/* ── Branding upload widget (U3) ────────────────────────────────────────── */

const MB = 1024 * 1024;
// Client allowlist mirrors the server's KIND_CONFIG (PNG/SVG/WebP/JPEG).
const UPLOAD_ACCEPT = "image/png,image/svg+xml,image/webp,image/jpeg";
const KIND_MAX: Record<"logo" | "favicon", number> = { logo: 2 * MB, favicon: 1 * MB };

// Subtle checkerboard so a transparent logo's edges are visible in the preview.
const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage:
    "linear-gradient(45deg,#e7e9f0 25%,transparent 25%),linear-gradient(-45deg,#e7e9f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e7e9f0 75%),linear-gradient(-45deg,transparent 75%,#e7e9f0 75%)",
  backgroundSize: "14px 14px",
  backgroundPosition: "0 0,0 7px,7px -7px,-7px 0",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / MB).toFixed(1)} MB`;
}

// Decode pixel dimensions client-side (used only to WARN on a non-square favicon
// — the server cover-crops, so we never hard-block on aspect).
function decodeDimensions(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

// Server faults → human-readable inline copy. Never surface raw JSON.
function humanizeUploadError(httpStatus: number, body: { error?: string; errors?: string[] }): string {
  if (Array.isArray(body?.errors) && body.errors.length) return body.errors.join(" ");
  if (httpStatus === 401) return "Your operator session has expired — refresh the page and sign in again.";
  if (httpStatus === 413) return "That file is too large for the server. Choose a smaller one.";
  if (httpStatus === 404) return "This store could not be found.";
  if (typeof body?.error === "string") return body.error.replace(/_/g, " ");
  return `Upload failed (HTTP ${httpStatus}).`;
}

/**
 * A single branding upload field: drag-drop dropzone + click-to-pick + live
 * preview + per-field requirements + a collapsible "paste a URL" fallback.
 * Posts multipart `{ file, kind }` to the U2 operator endpoint; on success it
 * hands the returned URL to `onUploaded` (the step persists it via PUT theme).
 */
function UploadField({
  kind, label: lbl, helper, value, tenantId, onUploaded, onPaste,
}: {
  kind: "logo" | "favicon";
  label: string;
  helper: string;
  value: string | null;
  tenantId: string;
  onUploaded: (url: string) => Promise<void> | void;
  onPaste: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [upWarn, setUpWarn] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [meta, setMeta] = useState<{ width: number | null; height: number | null; size: number } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  async function handleFile(file: File) {
    setUpErr(null);
    setUpWarn(null);
    setDone(false);

    // ── Client pre-validation (AD-5): block oversize / wrong-format here; let
    //    everything else (squareness etc.) flow to the authoritative server. ──
    const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
    const typeOk = isSvg || ["image/png", "image/webp", "image/jpeg"].includes(file.type);
    if (!typeOk) { setUpErr(`Unsupported file type. ${helper}`); return; }
    if (file.size > KIND_MAX[kind]) { setUpErr(`That file is ${formatBytes(file.size)} — too large. ${helper}`); return; }

    // Advisory squareness warning for raster favicons.
    if (kind === "favicon" && !isSvg) {
      const dims = await decodeDimensions(file);
      if (dims && Math.abs(dims.w - dims.h) > 2) {
        setUpWarn(`Heads up: this image is ${dims.w} × ${dims.h} (not square). It will be centre-cropped to a square.`);
      }
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`/api/platform/tenants/${tenantId}/upload`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setUpErr(humanizeUploadError(res.status, body)); return; }
      setMeta({ width: body.width ?? null, height: body.height ?? null, size: body.size ?? file.size });
      setDone(true);
      await onUploaded(body.url);
    } catch (e) {
      setUpErr(e instanceof Error ? e.message : "Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  }

  const openPicker = () => inputRef.current?.click();

  return (
    <div>
      {/* Live preview (B2) */}
      {kind === "logo" ? (
        <div style={{ ...CHECKERBOARD, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8, height: 56, display: "flex", alignItems: "center", justifyContent: "center", padding: 6, marginBottom: 8, overflow: "hidden" }}>
          {value
            ? <img src={value} alt={`${lbl} preview`} style={{ maxHeight: 44, maxWidth: "100%", objectFit: "contain" }} />
            : <span style={{ fontSize: 12, color: MUTED }}>No logo yet</span>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 8 }}>
          {[32, 64].map((sz) => (
            <div key={sz} style={{ textAlign: "center" }}>
              <div style={{ width: sz, height: sz, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#fff" }}>
                {value
                  ? <img src={value} alt={`Favicon ${sz}px preview`} style={{ width: sz, height: sz, objectFit: "cover" }} />
                  : <span style={{ fontSize: 10, color: MUTED }}>—</span>}
              </div>
              <span style={{ fontSize: 10, color: MUTED }}>{sz}px</span>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone (B1) — keyboard + role for a11y (D3) */}
      <div
        className="upload-zone"
        role="button"
        tabIndex={0}
        aria-label={`Upload ${lbl.toLowerCase()}: drag a file here or press Enter to choose one`}
        aria-busy={uploading}
        onClick={openPicker}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        style={{
          border: `1.5px dashed ${dragging ? ACCENT : "rgba(61,79,124,0.35)"}`,
          background: dragging ? "rgba(61,79,124,0.06)" : "#fbfcfe",
          borderRadius: 8, padding: "14px 12px", textAlign: "center", cursor: "pointer",
          color: ACCENT, fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44,
        }}
      >
        {uploading ? <><Spinner /> Uploading…</> : done ? <>Replace {lbl.toLowerCase()} ✓</> : <>⬆ Drag &amp; drop or click to upload</>}
        <input ref={inputRef} type="file" accept={UPLOAD_ACCEPT} style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>

      {/* Requirements / helper text (B3) */}
      <p style={{ color: "#7a8296", fontSize: 11.5, lineHeight: 1.45, margin: "6px 0 0" }}>{helper}</p>

      {/* States (B4): success w/ derived dims+size, warning, error */}
      {done && meta && (
        <p style={{ color: GREEN, fontSize: 11.5, margin: "4px 0 0", fontWeight: 600 }}>
          Uploaded ✓ {meta.width && meta.height ? `${meta.width} × ${meta.height}px · ` : ""}{formatBytes(meta.size)}
        </p>
      )}
      {upWarn && <p style={{ color: AMBER, fontSize: 11.5, margin: "4px 0 0" }}>{upWarn}</p>}
      {upErr && <p style={{ color: "#a01818", fontSize: 11.5, margin: "4px 0 0" }}>{upErr}</p>}

      {/* Paste-a-URL fallback (B1) */}
      <button
        type="button"
        aria-expanded={pasteOpen}
        onClick={() => setPasteOpen((o) => !o)}
        style={{ background: "none", border: "none", padding: "6px 0 0", color: ACCENT, fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
      >
        {pasteOpen ? "Hide URL field" : "or paste a URL"}
      </button>
      {pasteOpen && (
        <input
          style={{ ...input, marginTop: 6 }}
          value={value ?? ""}
          onChange={(e) => onPaste(e.target.value || null)}
          placeholder="https://… or /path"
          aria-label={`${lbl} URL`}
        />
      )}
    </div>
  );
}

/* ── Step 2: Branding ───────────────────────────────────────────────────── */

function BrandingStep({
  tenantId, status, onRefresh, onSkip,
}: { tenantId: string; status: OnboardingStatus; onRefresh: () => Promise<void>; onSkip: () => void }) {
  const [theme, setTheme] = useState<ThemeValue>({ ...DEFAULT_THEME });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/platform/tenants/${tenantId}/theme`);
        if (res.ok) { const b = await res.json(); setTheme({ ...DEFAULT_THEME, ...b.theme }); }
      } catch { /* keep defaults */ }
      setLoading(false);
    })();
  }, [tenantId]);

  function set<K extends keyof ThemeValue>(k: K, v: ThemeValue[K]) {
    setTheme((t) => ({ ...t, [k]: v }));
    setSaved(false);
  }

  // `override` lets an upload persist the freshly-returned URL immediately,
  // without waiting for the async `set()` state update to flush (React batches).
  async function save(override?: Partial<ThemeValue>) {
    const t = { ...theme, ...override };
    setSaving(true);
    setErrs([]);
    setSaved(false);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryColor: t.primaryColor,
          secondaryColor: t.secondaryColor,
          accentColor: t.accentColor,
          fontHeading: t.fontHeading,
          fontBody: t.fontBody,
          radius: t.radius,
          logoUrl: t.logoUrl || null,
          faviconUrl: t.faviconUrl || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErrs(body.errors ?? [body.message || body.error || `HTTP ${res.status}`]); return; }
      setSaved(true);
      await onRefresh();
    } catch (e) {
      setErrs([e instanceof Error ? e.message : "Failed to save branding"]);
    } finally {
      setSaving(false);
    }
  }

  // On a successful upload: reflect the new URL in the form AND persist it
  // straight away (mirrors the admin settings uploader's set-then-save flow).
  async function onUploaded(field: "logoUrl" | "faviconUrl", url: string) {
    set(field, url);
    await save({ [field]: url });
  }

  const colorRow = (k: "primaryColor" | "secondaryColor" | "accentColor", lbl: string) => (
    <div>
      <label style={label}>{lbl}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(theme[k]) ? theme[k] : "#000000"} onChange={(e) => set(k, e.target.value)} style={{ width: 40, height: 36, padding: 0, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, background: "#fff" }} />
        <input style={{ ...input, marginBottom: 0 }} value={theme[k]} onChange={(e) => set(k, e.target.value)} />
      </div>
    </div>
  );

  return (
    <div>
      <StepHeader num={2} title="Branding" tag="optional" />
      {status.steps.branding.done ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: GREEN_BG, color: GREEN, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>✓ Custom branding saved</div>
      ) : (
        <p style={{ color: MUTED, fontSize: 13, marginBottom: 14 }}>Using platform defaults. Customise below, or skip — branding never blocks go-live.</p>
      )}

      {loading ? (
        <p style={{ color: MUTED }}><Spinner /> Loading theme…</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {colorRow("primaryColor", "Primary")}
            {colorRow("secondaryColor", "Secondary")}
            {colorRow("accentColor", "Accent")}
            <div>
              <label style={label}>Corner radius</label>
              <select style={input as React.CSSProperties} value={theme.radius} onChange={(e) => set("radius", e.target.value)}>
                {RADIUS_ALLOWLIST.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Heading font</label>
              <select style={input as React.CSSProperties} value={theme.fontHeading} onChange={(e) => set("fontHeading", e.target.value)}>
                {FONT_ALLOWLIST.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Body font</label>
              <select style={input as React.CSSProperties} value={theme.fontBody} onChange={(e) => set("fontBody", e.target.value)}>
                {FONT_ALLOWLIST.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {/* Logo + favicon uploaders (U3) — drag-drop + preview + paste fallback. */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Logo &amp; favicon <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
            <div className="brand-uploads" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 6 }}>
              <UploadField
                kind="logo"
                label="Logo"
                helper="Transparent PNG or SVG, landscape (≈ 800 × 240 px). Max 2 MB. Shown ~40 px tall."
                value={theme.logoUrl ?? null}
                tenantId={tenantId}
                onUploaded={(url) => onUploaded("logoUrl", url)}
                onPaste={(v) => set("logoUrl", v)}
              />
              <UploadField
                kind="favicon"
                label="Favicon"
                helper="Square PNG or SVG, 512 × 512 px recommended. Max 1 MB."
                value={theme.faviconUrl ?? null}
                tenantId={tenantId}
                onUploaded={(url) => onUploaded("faviconUrl", url)}
                onPaste={(v) => set("faviconUrl", v)}
              />
            </div>
          </div>

          <BrandingPreview theme={theme} />

          {errs.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: "rgba(200,40,40,0.06)", border: "1px solid rgba(200,40,40,0.3)", color: "#a01818", fontSize: 13 }}>
              {errs.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            <button style={{ ...btn, opacity: saving ? 0.6 : 1 }} onClick={() => save()} disabled={saving}>
              {saving ? <><Spinner light /> Saving…</> : "Save branding"}
            </button>
            <button style={btnGhost} onClick={onSkip}>Skip — use defaults</button>
            {saved && <span style={{ color: GREEN, fontSize: 14, alignSelf: "center", fontWeight: 600 }}>Saved ✓</span>}
          </div>
          <p style={microcopy}>
            What happens next: these colours and fonts theme the hosted store at <code>/t/{status.slug}</code>.
            You can change them any time.
          </p>
        </>
      )}
    </div>
  );
}

function BrandingPreview({ theme }: { theme: ThemeValue }) {
  const vars: React.CSSProperties = {
    // CSS custom props for the mock; cast through Record to satisfy TS.
    ...( {
      "--p": theme.primaryColor,
      "--a": theme.accentColor,
      "--s": theme.secondaryColor,
      "--r": radiusToken(theme.radius),
    } as React.CSSProperties),
  };
  return (
    <div style={{ ...vars, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: "var(--p)", color: readableText(theme.primaryColor), padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: `'${theme.fontHeading}', sans-serif` }}>
        {theme.logoUrl ? (
          <img src={theme.logoUrl} alt="Store logo" style={{ height: 28, width: "auto", maxWidth: 180, objectFit: "contain" }} />
        ) : (
          <span style={{ fontWeight: 700, fontSize: 16 }}>Your Store</span>
        )}
        <span style={{ fontSize: 13 }}>Shop · About · Cart</span>
      </div>
      <div style={{ padding: 16, display: "flex", gap: 14, background: "#fafbfc" }}>
        <div style={{ width: 110, flexShrink: 0, border: "1px solid rgba(0,0,0,0.08)", borderRadius: "var(--r)", overflow: "hidden", background: "#fff" }}>
          <div style={{ height: 70, background: "var(--s)" }} />
          <div style={{ padding: 10, fontFamily: `'${theme.fontBody}', sans-serif` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>Handmade Mug</div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>$28.00</div>
            <button style={{ width: "100%", border: "none", borderRadius: "var(--r)", background: "var(--a)", color: readableText(theme.accentColor), fontSize: 12, fontWeight: 700, padding: "6px 0", cursor: "default" }}>Add to cart</button>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "#555", fontFamily: `'${theme.fontBody}', sans-serif`, lineHeight: 1.5 }}>
          Live preview — your primary, secondary and accent colours, fonts and corner radius
          applied to a mock storefront header and product card.
        </p>
      </div>
    </div>
  );
}

/* ── Step 3: Stripe ─────────────────────────────────────────────────────── */

function StripeStep({
  tenantId, status, onRefresh, origin, initialMode,
}: { tenantId: string; status: OnboardingStatus; onRefresh: () => Promise<void>; origin: string; initialMode: "return" | "refresh" | null }) {
  const stripe = status.steps.stripe;

  const [existingId, setExistingId] = useState("");
  const [busy, setBusy] = useState<null | "reuse" | "onboard" | "handoff" | "refresh">(null);
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Poll state (return mode), ported from O2's connect/return page.
  const [pollStatus, setPollStatus] = useState<StripeStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const pollCount = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  const isTerminal = useCallback((s: StripeStatus) => s.chargesEnabled || s.detailsSubmitted, []);

  const fetchStripe = useCallback(async (): Promise<StripeStatus | null> => {
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/stripe-status`);
      if (res.status === 409) { return null; }
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || b.error || `HTTP ${res.status}`); }
      const s: StripeStatus = await res.json();
      setPollStatus(s);
      // The GET syncs stripeOnboarded server-side; mirror into the rail when it flips.
      if (s.chargesEnabled) await onRefresh();
      return s;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to check Stripe status");
      return null;
    }
  }, [tenantId, onRefresh]);

  const scheduleNext = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(async () => {
      pollCount.current += 1;
      const s = await fetchStripe();
      if (!s || isTerminal(s) || pollCount.current >= MAX_POLLS) { setPolling(false); clearTimer(); }
      else scheduleNext();
    }, POLL_INTERVAL_MS);
  }, [clearTimer, fetchStripe, isTerminal]);

  // On return-mode mount: immediate GET then poll until terminal.
  useEffect(() => {
    if (initialMode !== "return") return;
    pollCount.current = 0;
    (async () => {
      const s = await fetchStripe();
      if (s && !isTerminal(s)) { setPolling(true); scheduleNext(); }
    })();
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);

  const checkAgain = useCallback(async () => { setBusy("onboard"); await fetchStripe(); setBusy(null); }, [fetchStripe]);

  async function connect(payload: Record<string, unknown>, mode: "reuse" | "onboard" | "handoff" | "refresh") {
    setBusy(mode);
    setErr(null);
    setNote(null);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      return body as { url?: string; attached?: boolean; onboarded?: boolean; accountId?: string };
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Stripe Connect failed");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function reuseExisting() {
    if (!existingId.trim()) { setErr("Enter an acct_… id."); return; }
    const r = await connect({ existingAccountId: existingId.trim() }, "reuse");
    if (r) {
      await onRefresh();
      setNote(r.onboarded ? "Account attached and ready to charge ✓" : "Account attached — Stripe still needs to finish verification.");
    }
  }

  async function onboardNow() {
    const r = await connect({
      returnUrl: `${origin}/platform/onboarding/${tenantId}?step=stripe&stripe=return`,
      refreshUrl: `${origin}/platform/onboarding/${tenantId}?step=stripe&stripe=refresh`,
    }, "onboard");
    if (r?.url) { window.open(r.url, "_blank", "noopener"); setNote("Stripe opened in a new tab. Finish there, then come back — this step auto-detects completion."); }
  }

  async function sendToMerchant() {
    const r = await connect({}, "handoff");
    if (r?.url) { setHandoffUrl(r.url); }
  }

  async function refreshLink() {
    const r = await connect({}, "refresh");
    if (r?.url) { window.location.href = r.url; }
  }

  // Onboarded → done banner.
  if (stripe.state === "onboarded" || pollStatus?.chargesEnabled) {
    return (
      <div>
        <StepHeader num={3} title="Stripe Connect" />
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, background: GREEN_BG, color: GREEN, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>✓ Stripe onboarded</div>
        <p style={{ color: "#3c4658", fontSize: 14 }}>This store can accept payments. {stripe.accountId && <code style={{ color: MUTED }}>{stripe.accountId}</code>}</p>
      </div>
    );
  }

  return (
    <div>
      <StepHeader num={3} title="Stripe Connect" />

      {err && <ErrBox msg={err} />}

      {/* return-mode poll surface */}
      {initialMode === "return" && (
        <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, background: "#f7f9fc", border: "1px solid rgba(45,59,85,0.10)" }}>
          {polling && <div style={{ display: "flex", alignItems: "center", gap: 8, color: MUTED, fontSize: 13 }}><Spinner /> Checking Stripe status…</div>}
          {!polling && pollStatus?.detailsSubmitted && !pollStatus.chargesEnabled && (
            <>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: AMBER_BG, color: AMBER, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>⏳ Stripe is reviewing this account</div>
              <p style={{ color: "#3c4658", fontSize: 13, margin: "4px 0 10px" }}>Usually just a few minutes. You can continue onboarding and come back.</p>
              <button style={btnGhost} onClick={checkAgain} disabled={busy !== null}>{busy ? <><Spinner /> Checking…</> : "Check again"}</button>
            </>
          )}
          {!polling && pollStatus && !pollStatus.detailsSubmitted && !pollStatus.chargesEnabled && (
            <p style={{ color: "#3c4658", fontSize: 13 }}>Onboarding wasn&apos;t finished. Use a path below to resume.</p>
          )}
          {!polling && !pollStatus && (
            <p style={{ color: "#3c4658", fontSize: 13 }}>No connected account yet — start one below.</p>
          )}
        </div>
      )}

      {initialMode === "refresh" && (
        <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, background: "#f7f9fc", border: "1px solid rgba(45,59,85,0.10)" }}>
          <p style={{ color: "#3c4658", fontSize: 13, marginBottom: 10 }}>Your Stripe setup link expired (they&apos;re single-use). Get a fresh one — nothing entered is lost.</p>
          <button style={btn} onClick={refreshLink} disabled={busy !== null}>{busy === "refresh" ? <><Spinner light /> Getting a link…</> : "Get a new link"}</button>
        </div>
      )}

      {stripe.state === "in_progress" && initialMode !== "return" && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: AMBER_BG, color: AMBER, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>⏳ Stripe in progress — KYC not yet complete</div>
      )}

      {note && <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: GREEN_BG, color: GREEN, fontSize: 13, fontWeight: 600 }}>{note}</div>}

      {/* Path A — reuse existing */}
      <PathCard title="Reuse an existing Stripe account" sub="One paste, instant if the account can already charge. (The fast path for Orange Slice Sport.)">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...input, marginBottom: 0, maxWidth: 280 }} value={existingId} onChange={(e) => setExistingId(e.target.value)} placeholder="acct_…" />
          <button style={btn} onClick={reuseExisting} disabled={busy !== null}>{busy === "reuse" ? <><Spinner light /> Attaching…</> : "Attach account"}</button>
        </div>
      </PathCard>

      {/* Path B — onboard now */}
      <PathCard title="Onboard now (you, at the keyboard)" sub="Opens Stripe in a new tab. When you return, this step auto-detects completion.">
        <button style={btn} onClick={onboardNow} disabled={busy !== null}>{busy === "onboard" ? <><Spinner light /> Opening…</> : "Onboard with Stripe →"}</button>
      </PathCard>

      {/* Path C — hand off */}
      <PathCard title="Send to the merchant" sub="Share a link so they finish KYC on their own time. The train keeps moving and detects completion when they're done.">
        {handoffUrl ? (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input readOnly style={{ ...input, marginBottom: 0, flex: 1, minWidth: 240 }} value={handoffUrl} />
              <CopyButton value={handoffUrl} label="Copy link" />
            </div>
            <p style={microcopy}>Email this to the merchant. They finish ID/bank verification on Stripe — it can take a few minutes. You can keep going and come back; the train remembers where you are.</p>
          </div>
        ) : (
          <button style={btnGhost} onClick={sendToMerchant} disabled={busy !== null}>{busy === "handoff" ? <><Spinner /> Generating…</> : "Generate hand-off link"}</button>
        )}
      </PathCard>

      <p style={microcopy}>
        Go-live is gated on Stripe being onboarded — but reaching the later steps is not. Set up
        products and your API key now, and circle back when Stripe clears.
      </p>
    </div>
  );
}

function PathCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid rgba(45,59,85,0.10)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, color: "#222b40", fontSize: 14, marginBottom: 2 }}>{title}</div>
      <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 12, lineHeight: 1.45 }}>{sub}</div>
      {children}
    </div>
  );
}

/* ── Step 4: Products ───────────────────────────────────────────────────── */

function ProductsStep({
  tenantId, status, onRefresh,
}: { tenantId: string; status: OnboardingStatus; onRefresh: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErrs([]);
    setAdded(null);
    const priceNum = Number(price);
    const localErrs: string[] = [];
    if (!name.trim()) localErrs.push("Name is required.");
    if (!Number.isFinite(priceNum) || priceNum <= 0) localErrs.push("Price must be greater than 0 (in dollars).");
    if (localErrs.length) { setErrs(localErrs); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), price: priceNum, description: description.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErrs(body.errors ?? [body.message || body.error || `HTTP ${res.status}`]); return; }
      setAdded(body.name ?? name.trim());
      setName(""); setPrice(""); setDescription("");
      await onRefresh();
    } catch (e) {
      setErrs([e instanceof Error ? e.message : "Failed to create product"]);
    } finally {
      setBusy(false);
    }
  }

  // Impersonation: a real form POST so the browser follows the 303 into /admin
  // (the existing audited flow). Carries the freshly-set as-admin-session cookie.
  function fullAdmin() {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/platform/tenants/${tenantId}/impersonate`;
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <div>
      <StepHeader num={4} title="Products" />
      <p style={{ color: MUTED, fontSize: 13, marginBottom: 14 }}>
        {status.steps.products.count > 0
          ? `${status.steps.products.count} product${status.steps.products.count === 1 ? "" : "s"} so far. One is enough to go live — add more any time.`
          : "Add at least one product so the store isn't empty. A minimal product satisfies the gate."}
      </p>

      <form onSubmit={create} style={{ border: "1px solid rgba(45,59,85,0.10)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div>
            <label style={label}>Name</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Handmade Mug" required />
          </div>
          <div>
            <label style={label}>Price (USD)</label>
            <input style={input} type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="28.00" required />
          </div>
        </div>
        <label style={label}>Description <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} />
        {errs.length > 0 && (
          <div style={{ margin: "4px 0 10px", color: "#a01818", fontSize: 13 }}>{errs.map((e, i) => <div key={i}>{e}</div>)}</div>
        )}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6 }}>
          <button type="submit" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy}>{busy ? <><Spinner light /> Adding…</> : "Add product"}</button>
          {added && <span style={{ color: GREEN, fontWeight: 600, fontSize: 14 }}>Added “{added}” ✓</span>}
        </div>
      </form>

      <button style={btnGhost} onClick={fullAdmin}>Add products in the full admin →</button>
      <p style={microcopy}>
        The full admin (images, variants, story) opens via an audited impersonation session — a red
        banner + Exit returns you here. On return, this step re-checks the count.
      </p>
    </div>
  );
}

/* ── Step 5: API key ────────────────────────────────────────────────────── */

const ALL_SCOPES = ["store:read", "store:write", "checkout:create"] as const;

function ApiKeyStep({
  tenantId, status, onRefresh,
}: { tenantId: string; status: OnboardingStatus; onRefresh: () => Promise<void> }) {
  const [name, setName] = useState("Storefront integration");
  const [scopes, setScopes] = useState<string[]>(["store:read", "checkout:create"]);
  const [env, setEnv] = useState<"live" | "test">("live");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [prefix, setPrefix] = useState<string>("");

  async function mint(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (scopes.length === 0) { setErr("Select at least one scope."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes, env }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body.errors && body.errors.join(" ")) || body.message || body.error || `HTTP ${res.status}`);
      setToken(body.token);
      setPrefix(body.prefix);
      await onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to mint key");
    } finally {
      setBusy(false);
    }
  }

  if (token) {
    return (
      <div>
        <StepHeader num={5} title="API key" />
        <div style={{ padding: 16, borderRadius: 10, border: "1px solid rgba(200,40,40,0.35)", background: "rgba(200,40,40,0.05)", marginBottom: 14 }}>
          <p style={{ color: "#a01818", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Store this now — it will not be shown again.</p>
          <code style={{ display: "block", padding: 14, background: "#11182b", color: "#9be7c4", borderRadius: 8, fontSize: 15, wordBreak: "break-all", marginBottom: 12 }}>{token}</code>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <CopyButton value={token} label="Copy key" />
            <span style={{ fontSize: 12, color: MUTED }}>prefix <code>{prefix}</code></span>
          </div>
        </div>
        <button style={btn} onClick={() => setToken(null)}>I&apos;ve stored it safely</button>
        <p style={microcopy}>This key authenticates the merchant&apos;s own site against the API. Never ship a <code>checkout:create</code> key to the browser.</p>
      </div>
    );
  }

  return (
    <div>
      <StepHeader num={5} title="API key" />
      {status.steps.apiKey.done && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: GREEN_BG, color: GREEN, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>✓ {status.steps.apiKey.activeCount} active key{status.steps.apiKey.activeCount === 1 ? "" : "s"}</div>
      )}
      <p style={{ color: MUTED, fontSize: 13, marginBottom: 14 }}>Mint a scoped key for embedding the store into the merchant&apos;s own site. The hosted <code>/t/{status.slug}</code> store sells without one.</p>

      {err && <ErrBox msg={err} />}

      <form onSubmit={mint}>
        <label style={label}>Key name</label>
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} required />
        <label style={{ ...label, marginTop: 12 }}>Scopes</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {ALL_SCOPES.map((s) => (
            <label key={s} style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((p) => e.target.checked ? [...p, s] : p.filter((x) => x !== s))} />
              <code>{s}</code>
            </label>
          ))}
        </div>
        <label style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={env === "test"} onChange={(e) => setEnv(e.target.checked ? "test" : "live")} />
          Use a <strong>test</strong> key instead of live
        </label>
        <button type="submit" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy || scopes.length === 0}>{busy ? <><Spinner light /> Minting…</> : `Mint ${env} key`}</button>
      </form>
      <p style={microcopy}>The raw key is shown exactly once, right after minting. Default is a <strong>live</strong> key — onboarding&apos;s goal is a sellable store.</p>
    </div>
  );
}

/* ── Step 6: Integration ────────────────────────────────────────────────── */

function IntegrationStep({
  tenantId, status, origin,
}: { tenantId: string; status: OnboardingStatus; origin: string }) {
  const [prefix, setPrefix] = useState<string | null>(null);
  const hostedUrl = `${origin}/t/${status.slug}`;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/platform/tenants/${tenantId}/api-keys`);
        if (res.ok) {
          const b = await res.json();
          const active = (b.keys ?? []).find((k: { revokedAt: string | null; prefix: string }) => !k.revokedAt);
          if (active) setPrefix(active.prefix);
        }
      } catch { /* non-fatal */ }
    })();
  }, [tenantId]);

  return (
    <div>
      <StepHeader num={6} title="Integration" />
      {status.steps.integration.done ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: GREEN_BG, color: GREEN, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>✓ Ready to integrate</div>
      ) : (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: AMBER_BG, color: AMBER, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Mint an API key first (step 5)</div>
      )}

      <div style={{ display: "grid", gap: 10, fontSize: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: MUTED, minWidth: 110 }}>Hosted store</span>
          <a href={hostedUrl} target="_blank" rel="noopener" style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}>{`/t/${status.slug}`}</a>
          <CopyButton value={hostedUrl} label="Copy URL" />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: MUTED, minWidth: 110 }}>API key prefix</span>
          {prefix ? <code>{prefix}</code> : <span style={{ color: MUTED }}>— mint a key in step 5 —</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: MUTED, minWidth: 110 }}>API reference</span>
          <a href="/api/v1/docs" target="_blank" rel="noopener" style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}>Swagger docs →</a>
        </div>
      </div>

      <a href={`/platform/tenants/${tenantId}/integration`} style={btn}>View full integration page →</a>
      <p style={microcopy}>
        The full integration page personalises base URL, slug, key prefix, the API table and
        <code> curl</code> examples for this store — the shippable artifact you hand the merchant.
      </p>
    </div>
  );
}

/* ── Step 7: Go live ────────────────────────────────────────────────────── */

function GoLiveStep({
  tenantId, status, onRefresh, origin,
}: { tenantId: string; status: OnboardingStatus; onRefresh: () => Promise<void>; origin: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [live, setLive] = useState(status.storeEnabled);

  const blocked = status.steps.goLive.blockedBy;
  const canGoLive = blocked.length === 0;
  const hostedUrl = `${origin}/t/${status.slug}`;

  async function goLive() {
    // Going live publishes the storefront to the public — confirm first (P2-1).
    if (!window.confirm("Take this store live? Its storefront becomes publicly sellable immediately.")) return;
    setBusy(true);
    setErr(null);
    setMissing(null);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/go-live`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.error === "prerequisites_unmet") { setMissing(body.missing ?? []); return; }
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setLive(true);
      await onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to take the store live");
    } finally {
      setBusy(false);
    }
  }

  if (live || status.storeEnabled) {
    return (
      <div>
        <StepHeader num={7} title="Go live" />
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#222b40", marginBottom: 6 }}>This store is live</h3>
        <p style={{ color: "#3c4658", fontSize: 14, marginBottom: 16 }}>It&apos;s sellable now. Share the hosted store or hand over the integration page.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href={hostedUrl} target="_blank" rel="noopener" style={btn}>Open live store →</a>
          <a href={`/platform/tenants/${tenantId}/integration`} style={btnGhost}>Integration page →</a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeader num={7} title="Go live" />
      <p style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>Final checklist. Stripe and ≥1 product are required; an API key is recommended; branding is optional.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <Pill on={status.steps.stripe.done} label="Stripe onboarded (required)" />
        <Pill on={status.steps.products.done} label={`At least one product (required)${status.steps.products.count ? ` — ${status.steps.products.count}` : ""}`} />
        <Pill on={status.steps.apiKey.done} label="API key minted (recommended)" recommended />
        <Pill on={!status.steps.branding.usingDefaults} label={status.steps.branding.usingDefaults ? "Branding — using defaults (optional)" : "Custom branding (optional)"} recommended />
      </div>

      {err && <ErrBox msg={err} />}
      {missing && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: AMBER_BG, color: AMBER, fontSize: 13 }}>
          Can&apos;t go live yet — still needed: {missing.join(", ")}.
        </div>
      )}

      <button style={{ ...btn, opacity: !canGoLive || busy ? 0.55 : 1 }} onClick={goLive} disabled={!canGoLive || busy}>
        {busy ? <><Spinner light /> Publishing…</> : "Take store live"}
      </button>
      {!canGoLive && (
        <p style={{ color: AMBER, fontSize: 13, marginTop: 10 }}>Blocked by: {blocked.join(", ")}. Finish {blocked.join(" & ")} first.</p>
      )}
    </div>
  );
}

/* ── tiny shared bits ───────────────────────────────────────────────────── */

function StepHeader({ num, title, tag }: { num: number; title: string; tag?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: "#222b40" }}>{num}. {title}</h2>
      {tag && <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, border: `1px solid ${MUTED}`, borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{tag}</span>}
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: "rgba(200,40,40,0.06)", border: "1px solid rgba(200,40,40,0.3)", color: "#a01818", fontSize: 13 }}>{msg}</div>
  );
}
