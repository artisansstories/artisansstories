"use client";

import { useState, useEffect } from "react";
import { NOTICE_MAX_MESSAGE, NOTICE_MAX_LINK_LABEL, NOTICE_STYLES, toNoticeInputValue, type NoticeStyle } from "@/lib/store-notice";
import { NOTICE_PALETTE } from "@/components/StoreNoticeBar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoticeView {
  status: "none" | "hidden" | "scheduled" | "expired" | "live";
  statusLabel: string;
  notice: {
    message: string;
    linkLabel: string | null;
    linkUrl: string | null;
    style: NoticeStyle;
    isVisible: boolean;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
}

interface Form {
  message: string;
  linkLabel: string;
  linkUrl: string;
  style: NoticeStyle;
  isVisible: boolean;
  startsAt: string;
  endsAt: string;
}

const EMPTY: Form = { message: "", linkLabel: "", linkUrl: "", style: "info", isVisible: true, startsAt: "", endsAt: "" };

const STYLE_LABEL: Record<NoticeStyle, string> = { info: "Info", success: "Success", warning: "Warning", urgent: "Urgent" };

const STATUS_COLOR: Record<NoticeView["status"], { bg: string; fg: string }> = {
  live: { bg: "#e7f1e4", fg: "#1e4a28" },
  scheduled: { bg: "#fdf1d6", fg: "#5a3b00" },
  expired: { bg: "#f0ebe3", fg: "#5a4a38" },
  hidden: { bg: "#f0ebe3", fg: "#5a4a38" },
  none: { bg: "#f0ebe3", fg: "#5a4a38" },
};

function toForm(v: NoticeView): Form {
  const n = v.notice;
  if (!n) return EMPTY;
  return {
    message: n.message,
    linkLabel: n.linkLabel ?? "",
    linkUrl: n.linkUrl ?? "",
    style: n.style,
    isVisible: n.isVisible,
    startsAt: toNoticeInputValue(n.startsAt),
    endsAt: toNoticeInputValue(n.endsAt),
  };
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: value ? "#8B6914" : "#d5cfc5",
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: value ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif" }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 12, color: "#9a876e", margin: 0, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #e0d5c5",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "'Inter',sans-serif",
  color: "#3a2e24",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NoticeBannerPage() {
  const [view, setView] = useState<NoticeView | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  }

  function apply(v: NoticeView) {
    setView(v);
    setForm(toForm(v));
  }

  useEffect(() => {
    fetch("/api/admin/store-notice")
      .then((r) => r.json())
      .then(apply)
      .catch(() => showToast("Failed to load the notice", true))
      .finally(() => setLoading(false));
  }, []);

  async function send(method: "PUT" | "DELETE", body?: unknown, done?: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/store-notice", {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      if (method === "DELETE") apply({ status: "none", statusLabel: "No notice", notice: null });
      else apply(data);
      showToast(done ?? "Notice saved");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save", true);
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    send("PUT", form);
  }

  function handleDelete() {
    if (!confirm("Delete this notice? It disappears from the storefront immediately.")) return;
    send("DELETE", undefined, "Notice deleted");
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const palette = NOTICE_PALETTE[form.style];
  const status = view?.status ?? "none";

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "clamp(22px,4vw,30px)", fontWeight: 600, color: "#3a2e24", fontFamily: "'Cormorant Garamond',serif", margin: 0 }}>
          Notice Banner
        </h1>
        <p style={{ fontSize: 14, color: "#9a876e", marginTop: 4 }}>
          A short message across the top of the live store (not the Coming Soon page). Times are Pacific (Los Angeles).
        </p>
      </div>

      {loading ? (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0d5c5", padding: 28 }}>
          {[200, 300, 250].map((w, i) => (
            <div key={i} style={{ height: 20, maxWidth: w, background: "#f0ebe3", borderRadius: 6, marginBottom: 18 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0d5c5", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: 0 }}>Status</h2>
              <span
                data-testid="notice-status"
                style={{ background: STATUS_COLOR[status].bg, color: STATUS_COLOR[status].fg, borderRadius: 999, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}
              >
                {view?.statusLabel ?? "No notice"}
              </span>
            </div>

            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#faf7f2", borderRadius: 8, border: "1px solid #ede8df" }}>
                <Toggle value={form.isVisible} onChange={(v) => set("isVisible", v)} label="Show notice" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", margin: 0 }}>{form.isVisible ? "Show" : "Hide"}</p>
                  <p style={{ fontSize: 12, color: "#9a876e", margin: "2px 0 0" }}>
                    {form.isVisible ? "Shown between the start and expiration times" : "Not shown on the store"}
                  </p>
                </div>
              </div>

              <Field label="Message" htmlFor="notice-message" hint={`${form.message.trim().length}/${NOTICE_MAX_MESSAGE} characters. Plain text.`}>
                <textarea
                  id="notice-message"
                  rows={3}
                  maxLength={NOTICE_MAX_MESSAGE}
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Free shipping on orders over $75 this weekend!"
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                <Field label="Link text (optional)" htmlFor="notice-link-label">
                  <input id="notice-link-label" maxLength={NOTICE_MAX_LINK_LABEL} value={form.linkLabel} onChange={(e) => set("linkLabel", e.target.value)} placeholder="Shop now" style={inputStyle} />
                </Field>
                <Field label="Link URL (optional)" htmlFor="notice-link-url" hint="https://… or a page like /shop">
                  <input id="notice-link-url" value={form.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="/shop" style={inputStyle} />
                </Field>
              </div>

              <Field label="Style" htmlFor="notice-style">
                <select id="notice-style" value={form.style} onChange={(e) => set("style", e.target.value as NoticeStyle)} style={inputStyle}>
                  {NOTICE_STYLES.map((s) => (
                    <option key={s} value={s}>{STYLE_LABEL[s]}</option>
                  ))}
                </select>
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                <Field label="Start (Pacific)" htmlFor="notice-start" hint="Leave empty to start immediately.">
                  <input id="notice-start" type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Expiration (Pacific, optional)" htmlFor="notice-end" hint="Leave empty to keep it up until you hide it.">
                  <input id="notice-end" type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} style={inputStyle} />
                </Field>
              </div>

              <Field label="Preview">
                <div
                  style={{
                    background: palette.bg,
                    color: palette.fg,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 8,
                    padding: "10px 16px",
                    fontSize: 14,
                    textAlign: "center",
                    overflowWrap: "anywhere",
                  }}
                >
                  {form.message.trim() || "Your message"}
                  {form.linkLabel.trim() && form.linkUrl.trim() && (
                    <> <span style={{ fontWeight: 600, textDecoration: "underline" }}>{form.linkLabel}</span></>
                  )}
                </div>
              </Field>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || !view?.notice}
              style={{
                padding: "10px 20px",
                border: "1px solid #e0d5c5",
                borderRadius: 9,
                background: "#fff",
                color: "#9b1c1c",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'Inter',sans-serif",
                cursor: saving || !view?.notice ? "not-allowed" : "pointer",
                opacity: saving || !view?.notice ? 0.5 : 1,
              }}
            >
              Delete notice
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: 9,
                background: "#8B6914",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'Inter',sans-serif",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: "0 2px 8px rgba(139,105,20,0.25)",
              }}
            >
              {saving ? "Saving…" : "Save Notice"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            background: toast.error ? "#dc2626" : "#3a2e24",
            color: "#fff",
            padding: "12px 22px",
            borderRadius: 10,
            fontSize: 14,
            fontFamily: "'Inter',sans-serif",
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
