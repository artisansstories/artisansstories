"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";

interface Discount {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  minimumOrderAmount: number | null;
  appliesToAll: boolean;
  productIds: string[];
  categoryIds: string[];
  usageLimit: number | null;
  perCustomerLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface DiscountFormProps {
  discount?: Discount;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  // datetime-local expects "YYYY-MM-DDTHH:mm"
  return iso.slice(0, 16);
}

function fromDatetimeLocal(val: string): string | null {
  if (!val) return null;
  return new Date(val).toISOString();
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: "20px 24px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: "0 0 16px" }}>{title}</h2>
      {children}
    </div>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#5a4a38", marginBottom: 6, fontFamily: "'Inter',sans-serif" }}>
      {children}
    </label>
  );
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ede8df",
    fontSize: 14, color: "#3a2e24", background: "#faf7f2", fontFamily: "'Inter',sans-serif",
    outline: "none", boxSizing: "border-box",
    ...extra,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DiscountForm({ discount }: DiscountFormProps) {
  const router = useRouter();
  const isEdit = !!discount;

  const [code, setCode] = useState(discount?.code ?? "");
  const [type, setType] = useState<DiscountType>(discount?.type ?? "PERCENTAGE");
  const [valueRaw, setValueRaw] = useState<string>(() => {
    if (!discount) return "";
    if (discount.type === "FIXED_AMOUNT") return (discount.value / 100).toFixed(2);
    if (discount.type === "FREE_SHIPPING") return "0";
    return String(discount.value);
  });
  const [minimumOrderRaw, setMinimumOrderRaw] = useState<string>(
    discount?.minimumOrderAmount != null ? (discount.minimumOrderAmount / 100).toFixed(2) : ""
  );
  const [appliesToAll, setAppliesToAll] = useState(discount?.appliesToAll ?? true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(discount?.categoryIds ?? []);
  const [usageLimit, setUsageLimit] = useState<string>(discount?.usageLimit != null ? String(discount.usageLimit) : "");
  const [perCustomerLimit, setPerCustomerLimit] = useState<string>(discount?.perCustomerLimit != null ? String(discount.perCustomerLimit) : "");
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(discount?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(discount?.endsAt ?? null));
  const [isActive, setIsActive] = useState(discount?.isActive ?? true);

  const [categories, setCategories] = useState<Category[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d: { categories: Category[] }) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  async function generateCode() {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/discounts/generate-code");
      const data = await res.json() as { code: string };
      setCode(data.code);
    } catch {
      showToast("Failed to generate code");
    } finally {
      setGenerating(false);
    }
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  // When type changes, reset value
  function handleTypeChange(t: DiscountType) {
    setType(t);
    if (t === "FREE_SHIPPING") setValueRaw("0");
    else setValueRaw("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) { setError("Code is required"); return; }
    if (type !== "FREE_SHIPPING" && !valueRaw) { setError("Value is required"); return; }

    let value = 0;
    if (type === "PERCENTAGE") {
      value = parseInt(valueRaw, 10);
      if (isNaN(value) || value < 1 || value > 100) { setError("Percentage must be 1–100"); return; }
    } else if (type === "FIXED_AMOUNT") {
      const dollars = parseFloat(valueRaw);
      if (isNaN(dollars) || dollars <= 0) { setError("Amount must be greater than 0"); return; }
      value = Math.round(dollars * 100);
    }

    let minimumOrderAmount: number | null = null;
    if (minimumOrderRaw) {
      const dollars = parseFloat(minimumOrderRaw);
      if (!isNaN(dollars) && dollars > 0) minimumOrderAmount = Math.round(dollars * 100);
    }

    const body = {
      code: trimmedCode,
      type,
      value,
      minimumOrderAmount,
      appliesToAll,
      productIds: [],
      categoryIds: appliesToAll ? [] : selectedCategories,
      usageLimit: usageLimit ? parseInt(usageLimit, 10) : null,
      perCustomerLimit: perCustomerLimit ? parseInt(perCustomerLimit, 10) : null,
      startsAt: fromDatetimeLocal(startsAt),
      endsAt: fromDatetimeLocal(endsAt),
      isActive,
    };

    setSaving(true);
    try {
      const url = isEdit ? `/api/admin/discounts/${discount.id}` : "/api/admin/discounts";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save discount");
        return;
      }
      router.push("/admin/discounts");
      router.refresh();
    } catch {
      setError("Failed to save discount");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", maxWidth: 680 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: "#fef9ec", color: "#8B6914", border: "1px solid #C9A84C",
          borderRadius: 10, padding: "12px 18px", fontSize: 14, fontWeight: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
        }}>
          {toast}
        </div>
      )}

      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push("/admin/discounts")}
          style={{ background: "none", border: "none", color: "#9a876e", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8, fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 4 }}
        >
          ← Back to Discounts
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#3a2e24", fontFamily: "'Cormorant Garamond',serif", margin: 0 }}>
          {isEdit ? "Edit Discount" : "Create Discount"}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Code Section */}
        <Section title="Discount Code">
          <Label htmlFor="code">Code</Label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. SUMMER20"
              style={{ ...inputStyle({ fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.06em", flex: 1 }) }}
            />
            <button
              type="button"
              onClick={generateCode}
              disabled={generating}
              style={{
                padding: "9px 16px", borderRadius: 8, border: "1px solid #C9A84C",
                background: "#fdf5ea", color: "#8B6914", fontSize: 13, fontWeight: 600,
                cursor: generating ? "not-allowed" : "pointer", fontFamily: "'Inter',sans-serif",
                whiteSpace: "nowrap", opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? "..." : "Generate"}
            </button>
          </div>
        </Section>

        {/* Type & Value Section */}
        <Section title="Type & Value">
          <Label>Discount Type</Label>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"] as DiscountType[]).map((t) => {
              const labels: Record<DiscountType, string> = {
                PERCENTAGE: "Percentage (%)",
                FIXED_AMOUNT: "Fixed Amount ($)",
                FREE_SHIPPING: "Free Shipping",
              };
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  style={{
                    padding: "8px 16px", borderRadius: 8,
                    border: `1px solid ${active ? "#8B6914" : "#ede8df"}`,
                    background: active ? "#8B6914" : "#fff",
                    color: active ? "#fff" : "#5a4a38",
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    cursor: "pointer", fontFamily: "'Inter',sans-serif",
                    transition: "all 0.15s",
                  }}
                >
                  {labels[t]}
                </button>
              );
            })}
          </div>

          {type !== "FREE_SHIPPING" && (
            <div>
              <Label htmlFor="value">
                {type === "PERCENTAGE" ? "Percentage (1–100)" : "Amount ($)"}
              </Label>
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                {type === "FIXED_AMOUNT" && (
                  <span style={{ padding: "9px 12px", background: "#f0ebe3", border: "1px solid #ede8df", borderRight: "none", borderRadius: "8px 0 0 8px", fontSize: 14, color: "#8a7060" }}>
                    $
                  </span>
                )}
                <input
                  id="value"
                  type="number"
                  value={valueRaw}
                  onChange={(e) => setValueRaw(e.target.value)}
                  min={type === "PERCENTAGE" ? 1 : 0.01}
                  max={type === "PERCENTAGE" ? 100 : undefined}
                  step={type === "PERCENTAGE" ? 1 : 0.01}
                  placeholder={type === "PERCENTAGE" ? "e.g. 20" : "e.g. 15.00"}
                  style={{
                    ...inputStyle({
                      borderRadius: type === "PERCENTAGE" ? "8px 0 0 8px" : "0",
                      borderRight: type === "PERCENTAGE" ? "1px solid #ede8df" : "none",
                      flex: 1,
                    }),
                    ...(type === "FIXED_AMOUNT" ? { borderRadius: 0 } : {}),
                  }}
                />
                {type === "PERCENTAGE" && (
                  <span style={{ padding: "9px 12px", background: "#f0ebe3", border: "1px solid #ede8df", borderLeft: "none", borderRadius: "0 8px 8px 0", fontSize: 14, color: "#8a7060" }}>
                    %
                  </span>
                )}
                {type === "FIXED_AMOUNT" && (
                  <span style={{ padding: "9px 12px", background: "#f0ebe3", border: "1px solid #ede8df", borderLeft: "none", borderRadius: "0 8px 8px 0", fontSize: 14, color: "#8a7060", whiteSpace: "nowrap" }}>
                    off
                  </span>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* Conditions Section */}
        <Section title="Conditions">
          <div style={{ marginBottom: 16 }}>
            <Label htmlFor="minimumOrder">Minimum Order Amount (optional)</Label>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ padding: "9px 12px", background: "#f0ebe3", border: "1px solid #ede8df", borderRight: "none", borderRadius: "8px 0 0 8px", fontSize: 14, color: "#8a7060" }}>
                $
              </span>
              <input
                id="minimumOrder"
                type="number"
                value={minimumOrderRaw}
                onChange={(e) => setMinimumOrderRaw(e.target.value)}
                min={0}
                step={0.01}
                placeholder="0.00 (no minimum)"
                style={{ ...inputStyle({ borderRadius: "0 8px 8px 0", borderLeft: "none", flex: 1 }) }}
              />
            </div>
          </div>

          <div>
            <Label>Applies To</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "#3a2e24", fontFamily: "'Inter',sans-serif" }}>
                <input
                  type="radio"
                  checked={appliesToAll}
                  onChange={() => setAppliesToAll(true)}
                  style={{ accentColor: "#8B6914" }}
                />
                All products
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "#3a2e24", fontFamily: "'Inter',sans-serif" }}>
                <input
                  type="radio"
                  checked={!appliesToAll}
                  onChange={() => setAppliesToAll(false)}
                  style={{ accentColor: "#8B6914" }}
                />
                Specific categories
              </label>
            </div>

            {!appliesToAll && categories.length > 0 && (
              <div style={{ marginTop: 12, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 6 }}>
                {categories.map((cat) => (
                  <label key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "#3a2e24", fontFamily: "'Inter',sans-serif" }}>
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                      style={{ accentColor: "#8B6914" }}
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Usage Limits Section */}
        <Section title="Usage Limits">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <Label htmlFor="usageLimit">Total Usage Limit</Label>
              <input
                id="usageLimit"
                type="number"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                min={1}
                step={1}
                placeholder="Unlimited"
                style={inputStyle()}
              />
              <p style={{ fontSize: 12, color: "#9a876e", margin: "4px 0 0", fontFamily: "'Inter',sans-serif" }}>Leave empty for unlimited uses</p>
            </div>
            <div>
              <Label htmlFor="perCustomerLimit">Per Customer Limit</Label>
              <input
                id="perCustomerLimit"
                type="number"
                value={perCustomerLimit}
                onChange={(e) => setPerCustomerLimit(e.target.value)}
                min={1}
                step={1}
                placeholder="Unlimited"
                style={inputStyle()}
              />
              <p style={{ fontSize: 12, color: "#9a876e", margin: "4px 0 0", fontFamily: "'Inter',sans-serif" }}>Leave empty for no per-customer limit</p>
            </div>
          </div>
        </Section>

        {/* Active Period Section */}
        <Section title="Active Period">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <Label htmlFor="startsAt">Start Date (optional)</Label>
              <input
                id="startsAt"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                style={inputStyle()}
              />
            </div>
            <div>
              <Label htmlFor="endsAt">End Date (optional)</Label>
              <input
                id="endsAt"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                style={inputStyle()}
              />
            </div>
          </div>
        </Section>

        {/* Status Section */}
        <Section title="Status">
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: "none",
                background: isActive ? "#16a34a" : "#d1c5b4",
                cursor: "pointer", position: "relative", transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: isActive ? 22 : 3,
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
            <span style={{ fontSize: 14, color: "#3a2e24", fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>
              {isActive ? "Active" : "Inactive"}
            </span>
          </label>
        </Section>

        {/* Error */}
        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", fontSize: 14, marginBottom: 16, fontFamily: "'Inter',sans-serif" }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => router.push("/admin/discounts")}
            style={{ padding: "10px 22px", borderRadius: 9, border: "1px solid #ede8df", background: "#fff", color: "#5a4a38", fontSize: 14, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 500 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 28px", borderRadius: 9, border: "none",
              background: saving ? "#c9a84c" : "#8B6914", color: "#fff",
              fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "'Inter',sans-serif", opacity: saving ? 0.8 : 1,
              transition: "background 0.15s",
            }}
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Discount"}
          </button>
        </div>
      </form>

      <style>{`
        @media (max-width: 600px) {
          div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
