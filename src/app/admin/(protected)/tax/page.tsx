"use client";

import { useState, useEffect } from "react";
import { US_STATES } from "@/lib/us-states";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaxSettings {
  stripeTaxEnabled: boolean;
  defaultTaxRate: number;
  nexusStates: string[];
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif" }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 12, color: "#9a876e", margin: 0, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TaxPage() {
  const [settings, setSettings] = useState<TaxSettings>({
    stripeTaxEnabled: true,
    defaultTaxRate: 8.25,
    nexusStates: ["CA"],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    fetch("/api/admin/tax")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(() => showToast("Failed to load tax settings", true))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tax", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setSettings(data);
      showToast("Tax settings saved");
    } catch {
      showToast("Failed to save tax settings", true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');`}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "clamp(22px,4vw,30px)", fontWeight: 600, color: "#3a2e24", fontFamily: "'Cormorant Garamond',serif", margin: 0 }}>
          Tax Settings
        </h1>
        <p style={{ fontSize: 14, color: "#9a876e", marginTop: 4 }}>
          Stripe Tax calculates tax automatically based on each customer&apos;s shipping address
        </p>
      </div>

      {loading ? (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0d5c5", padding: 28 }}>
          {[200, 300, 250, 400].map((w, i) => (
            <div key={i} style={{ height: 20, width: w, background: "#f0ebe3", borderRadius: 6, marginBottom: 18, animation: "pulse 1.4s ease-in-out infinite" }} />
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>

          {/* Business Location card */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0d5c5", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
              </svg>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: 0 }}>
                Business Location
              </h2>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px", background: "#faf7f2", borderRadius: 8, border: "1px solid #ede8df" }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f5ede0", border: "1px solid #e8d5b0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", margin: "0 0 3px", fontFamily: "'Inter',sans-serif" }}>
                    Livermore, California (Alameda County)
                  </p>
                  <p style={{ fontSize: 12, color: "#9a876e", margin: 0, lineHeight: 1.5 }}>
                    Combined rate: 10.25% — registered in Stripe Tax as your origin address.
                    California customers are charged the correct local rate; out-of-state customers are charged $0 tax.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stripe Tax toggle */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0d5c5", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: 0 }}>
                Automatic Tax Calculation
              </h2>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <Field
                label="Stripe Tax"
                hint="Stripe Tax calculates the correct tax for every order based on the customer's shipping address and your nexus configuration. No manual rate entry needed."
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#faf7f2", borderRadius: 8, border: "1px solid #ede8df" }}>
                  <Toggle
                    value={settings.stripeTaxEnabled}
                    onChange={(v) => setSettings((s) => ({ ...s, stripeTaxEnabled: v }))}
                  />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", margin: 0 }}>
                      {settings.stripeTaxEnabled ? "Stripe Tax is enabled" : "Stripe Tax is disabled"}
                    </p>
                    <p style={{ fontSize: 12, color: "#9a876e", margin: "2px 0 0" }}>
                      {settings.stripeTaxEnabled
                        ? "Tax is calculated automatically per order — no hardcoded rates"
                        : "Enable to activate automatic tax calculation"}
                    </p>
                  </div>
                </div>
              </Field>
            </div>
          </div>

          {/* Nexus States */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0d5c5", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: 0 }}>
                Nexus States
              </h2>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* CA chip — always shown, read-only */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  background: "#f0f9f0",
                  color: "#2d6a2d",
                  border: "1px solid #b8dbb8",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'Inter',sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  CA — California
                </span>
                <span style={{ fontSize: 12, color: "#9a876e" }}>Active nexus — matches your Stripe Tax configuration</span>
              </div>

              {/* Show additional saved nexus states (beyond CA) if any */}
              {settings.nexusStates.filter((c) => c !== "CA").length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {settings.nexusStates.filter((c) => c !== "CA").map((code) => {
                    const state = US_STATES.find((s) => s.code === code);
                    return (
                      <span
                        key={code}
                        style={{
                          background: "#f5ede0",
                          color: "#8B6914",
                          border: "1px solid #e8d5b0",
                          borderRadius: 5,
                          padding: "3px 10px",
                          fontSize: 12,
                          fontWeight: 500,
                          fontFamily: "'Inter',sans-serif",
                        }}
                      >
                        {state?.code ?? code} — {state?.name ?? code}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Info */}
              <div style={{
                display: "flex",
                gap: 10,
                padding: "12px 14px",
                background: "#fffbf0",
                border: "1px solid #e8d5b0",
                borderRadius: 8,
                borderLeft: "3px solid #C9A84C",
              }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                </svg>
                <p style={{ fontSize: 12, color: "#7a5c3a", margin: 0, lineHeight: 1.6 }}>
                  Tax rates are determined by Stripe Tax based on the customer&apos;s shipping address.
                  California orders are taxed at the correct local rate (Livermore/Alameda County: 10.25%).
                  Out-of-state orders are charged $0 until you reach economic nexus thresholds in those states.
                  To add nexus states as your business grows, add them at{" "}
                  <strong>dashboard.stripe.com/tax/registrations</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
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
          whiteSpace: "nowrap",
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
