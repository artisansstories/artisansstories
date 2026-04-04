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

// ─── Multi-Select for US States ───────────────────────────────────────────────

function StatesSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = US_STATES.filter(
    (s) =>
      !selected.includes(s.code) &&
      (s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()))
  );

  function toggle(code: string) {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          border: "1px solid #e0d5c5",
          borderRadius: 8,
          padding: "6px 8px",
          background: "#fff",
          cursor: "text",
          minHeight: 42,
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          alignItems: "center",
        }}
        onClick={() => setOpen(true)}
      >
        {selected.map((code) => {
          const state = US_STATES.find((s) => s.code === code);
          return (
            <span
              key={code}
              style={{
                background: "#f5ede0",
                color: "#8B6914",
                border: "1px solid #e8d5b0",
                borderRadius: 5,
                padding: "2px 8px",
                fontSize: 12,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {state?.code ?? code} — {state?.name ?? code}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(code); }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#8B6914", padding: 0, lineHeight: 1, fontSize: 15 }}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? "Search states…" : ""}
          style={{ border: "none", outline: "none", fontSize: 13, flex: "1 1 100px", minWidth: 80, background: "transparent", fontFamily: "'Inter',sans-serif" }}
        />
      </div>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => { setOpen(false); setSearch(""); }} />
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 20,
            background: "#fff",
            border: "1px solid #e0d5c5",
            borderRadius: 8,
            marginTop: 4,
            maxHeight: 220,
            overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}>
            {filtered.length === 0 ? (
              <p style={{ padding: "10px 14px", fontSize: 13, color: "#9a876e" }}>No states match</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => { toggle(s.code); setSearch(""); }}
                  style={{
                    display: "flex",
                    width: "100%",
                    padding: "8px 14px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    color: "#3a2e24",
                    fontFamily: "'Inter',sans-serif",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf3e8"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 11, color: "#9a876e", fontWeight: 700, width: 26 }}>{s.code}</span>
                  {s.name}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
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
    stripeTaxEnabled: false,
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
          Configure tax calculation and nexus obligations
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
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0d5c5", overflow: "hidden", maxWidth: 680 }}>
          {/* Card header */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", gap: 10 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
            </svg>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: 0 }}>
              Tax Configuration
            </h2>
          </div>

          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Stripe Tax toggle */}
            <Field
              label="Stripe Tax"
              hint="When enabled, Stripe Tax will automatically calculate the correct tax amount based on the customer's location and your nexus. Requires Stripe Tax to be activated in your Stripe dashboard."
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
                    Automatic tax calculation via Stripe
                  </p>
                </div>
              </div>
            </Field>

            {/* Divider */}
            <div style={{ borderTop: "1px solid #ede8df" }} />

            {/* Default tax rate */}
            <Field
              label="Default Tax Rate (%)"
              hint="Used as a fallback when Stripe Tax is disabled. Applied to all taxable items."
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.defaultTaxRate}
                  onChange={(e) => setSettings((s) => ({ ...s, defaultTaxRate: parseFloat(e.target.value) || 0 }))}
                  style={{
                    width: 120,
                    padding: "9px 12px",
                    border: "1px solid #e0d5c5",
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: "'Inter',sans-serif",
                    outline: "none",
                    color: "#3a2e24",
                  }}
                />
                <span style={{ fontSize: 14, color: "#9a876e" }}>%</span>
                {settings.defaultTaxRate > 0 && !settings.stripeTaxEnabled && (
                  <span style={{ fontSize: 12, color: "#8B6914", background: "#fdf5e4", border: "1px solid #e8d5b0", borderRadius: 5, padding: "3px 8px" }}>
                    Applied as fallback rate
                  </span>
                )}
              </div>
            </Field>

            {/* Divider */}
            <div style={{ borderTop: "1px solid #ede8df" }} />

            {/* Nexus States */}
            <Field
              label="Nexus States"
              hint="Nexus states are where your business has a physical presence and a sales tax collection obligation. Tax will be collected for orders shipping to these states."
            >
              <StatesSelect
                selected={settings.nexusStates}
                onChange={(v) => setSettings((s) => ({ ...s, nexusStates: v }))}
              />
              {settings.nexusStates.length > 0 && (
                <p style={{ fontSize: 12, color: "#7a5c3a", marginTop: 4 }}>
                  {settings.nexusStates.length} state{settings.nexusStates.length !== 1 ? "s" : ""} with nexus:{" "}
                  {settings.nexusStates
                    .map((c) => US_STATES.find((s) => s.code === c)?.name ?? c)
                    .join(", ")}
                </p>
              )}
            </Field>

            {/* Info banner */}
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
                Tax obligations vary by jurisdiction. Consult a tax professional to determine your full nexus obligations.
                This configuration does not constitute tax advice.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "14px 24px", borderTop: "1px solid #ede8df", display: "flex", justifyContent: "flex-end" }}>
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
