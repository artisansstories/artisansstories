"use client";

import { useState, useEffect, useCallback } from "react";
import { COUNTRIES, US_STATES } from "@/lib/us-states";

// ─── Types ────────────────────────────────────────────────────────────────────

type RateCondition = "FLAT" | "WEIGHT" | "ORDER_VALUE" | "FREE";

interface ShippingRate {
  id: string;
  zoneId: string;
  name: string;
  condition: RateCondition;
  minValue: number | null;
  maxValue: number | null;
  price: number;
  isActive: boolean;
  createdAt: string;
}

interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  regions: string[];
  isActive: boolean;
  position: number;
  rates: ShippingRate[];
  _count: { rates: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRate(rate: ShippingRate): string {
  if (rate.condition === "FREE") return "Free";
  if (rate.condition === "ORDER_VALUE") {
    if (rate.minValue != null) {
      return `Free on orders over $${(rate.minValue / 100).toFixed(2)}`;
    }
    return formatPrice(rate.price);
  }
  if (rate.condition === "WEIGHT") {
    const parts = [];
    if (rate.minValue != null) parts.push(`min ${rate.minValue} oz`);
    if (rate.maxValue != null) parts.push(`max ${rate.maxValue} oz`);
    return `${formatPrice(rate.price)}${parts.length ? ` (${parts.join(", ")})` : ""}`;
  }
  return formatPrice(rate.price);
}

function conditionLabel(c: RateCondition): string {
  if (c === "FLAT") return "Flat rate";
  if (c === "WEIGHT") return "Weight-based";
  if (c === "ORDER_VALUE") return "Order value";
  if (c === "FREE") return "Free";
  return c;
}

function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

// ─── Empty Rate Form State ────────────────────────────────────────────────────

const emptyRateForm = () => ({
  name: "",
  condition: "FLAT" as RateCondition,
  minValue: "",
  maxValue: "",
  price: "",
  isActive: true,
});

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
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
          top: 2,
          left: value ? 20 : 2,
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

// ─── Multi-Select Chips ───────────────────────────────────────────────────────

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
}: {
  label?: string;
  options: { code: string; name: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter(
    (o) =>
      !selected.includes(o.code) &&
      (o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.code.toLowerCase().includes(search.toLowerCase()))
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
      {label && (
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#7a5c3a", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </label>
      )}
      <div
        style={{
          border: "1px solid #e0d5c5",
          borderRadius: 8,
          padding: "6px 8px",
          background: "#fff",
          cursor: "text",
          minHeight: 40,
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          alignItems: "center",
        }}
        onClick={() => setOpen(true)}
      >
        {selected.map((code) => {
          const opt = options.find((o) => o.code === code);
          return (
            <span
              key={code}
              style={{
                background: "#f5ede0",
                color: "#8B6914",
                border: "1px solid #e8d5b0",
                borderRadius: 5,
                padding: "2px 7px",
                fontSize: 12,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {opt?.name ?? code}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(code); }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#8B6914", padding: 0, lineHeight: 1, fontSize: 14 }}
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
          placeholder={selected.length === 0 ? (placeholder ?? "Search...") : ""}
          style={{ border: "none", outline: "none", fontSize: 13, flex: "1 1 80px", minWidth: 60, background: "transparent", fontFamily: "'Inter',sans-serif" }}
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
            maxHeight: 200,
            overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}>
            {filtered.length === 0 ? (
              <p style={{ padding: "10px 14px", fontSize: 13, color: "#9a876e" }}>No options</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.code}
                  type="button"
                  onClick={() => { toggle(o.code); setSearch(""); }}
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
                    gap: 8,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf3e8"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 11, color: "#9a876e", fontWeight: 600, width: 26 }}>{o.code}</span>
                  {o.name}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Rate Form ────────────────────────────────────────────────────────────────

function RateForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ReturnType<typeof emptyRateForm>;
  onSave: (data: ReturnType<typeof emptyRateForm>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(k: string, v: unknown) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Rate name is required";
    if (form.condition !== "FREE") {
      const p = parseFloat(form.price as string);
      if (isNaN(p) || p < 0) e.price = "Enter a valid price";
    }
    return e;
  }

  function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  }

  const isFree = form.condition === "FREE";

  return (
    <div style={{ background: "#faf7f2", border: "1px solid #e8e0d4", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Name */}
      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#7a5c3a", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Rate Name</label>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Standard Shipping"
          style={{
            width: "100%",
            padding: "9px 12px",
            border: `1px solid ${errors.name ? "#dc2626" : "#e0d5c5"}`,
            borderRadius: 7,
            fontSize: 13,
            fontFamily: "'Inter',sans-serif",
            outline: "none",
          }}
        />
        {errors.name && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 3 }}>{errors.name}</p>}
      </div>

      {/* Condition */}
      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#7a5c3a", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Condition</label>
        <select
          value={form.condition}
          onChange={(e) => set("condition", e.target.value as RateCondition)}
          style={{ width: "100%", padding: "9px 12px", border: "1px solid #e0d5c5", borderRadius: 7, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none", background: "#fff" }}
        >
          <option value="FLAT">Flat rate</option>
          <option value="FREE">Free shipping</option>
          <option value="WEIGHT">Weight-based</option>
          <option value="ORDER_VALUE">Based on order value</option>
        </select>
      </div>

      {/* Min/Max for WEIGHT or ORDER_VALUE */}
      {(form.condition === "WEIGHT" || form.condition === "ORDER_VALUE") && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#7a5c3a", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {form.condition === "WEIGHT" ? "Min Weight (oz)" : "Min Order ($)"}
            </label>
            <input
              type="number"
              min="0"
              step={form.condition === "ORDER_VALUE" ? "0.01" : "1"}
              value={form.minValue}
              onChange={(e) => set("minValue", e.target.value)}
              placeholder="0"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #e0d5c5", borderRadius: 7, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#7a5c3a", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {form.condition === "WEIGHT" ? "Max Weight (oz)" : "Max Order ($)"}
            </label>
            <input
              type="number"
              min="0"
              step={form.condition === "ORDER_VALUE" ? "0.01" : "1"}
              value={form.maxValue}
              onChange={(e) => set("maxValue", e.target.value)}
              placeholder="No limit"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #e0d5c5", borderRadius: 7, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none" }}
            />
          </div>
        </div>
      )}

      {/* Price */}
      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#7a5c3a", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Price ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={isFree ? "0" : form.price}
          onChange={(e) => set("price", e.target.value)}
          disabled={isFree}
          placeholder="0.00"
          style={{
            width: "100%",
            padding: "9px 12px",
            border: `1px solid ${errors.price ? "#dc2626" : "#e0d5c5"}`,
            borderRadius: 7,
            fontSize: 13,
            fontFamily: "'Inter',sans-serif",
            outline: "none",
            background: isFree ? "#f5f2ee" : "#fff",
            color: isFree ? "#9a876e" : "#3a2e24",
          }}
        />
        {errors.price && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 3 }}>{errors.price}</p>}
      </div>

      {/* Active */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Toggle value={form.isActive} onChange={(v) => set("isActive", v)} />
        <span style={{ fontSize: 13, color: "#5a4a38" }}>Active</span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid #e0d5c5", background: "#fff", color: "#7a5c3a", fontSize: 13, fontFamily: "'Inter',sans-serif", cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "#8B6914", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save Rate"}
        </button>
      </div>
    </div>
  );
}

// ─── Zone Form (create/edit zone) ─────────────────────────────────────────────

function ZoneForm({
  initial,
  onSave,
  onCancel,
  saving,
  title,
}: {
  initial: { name: string; countries: string[]; regions: string[]; isActive: boolean };
  onSave: (data: { name: string; countries: string[]; regions: string[]; isActive: boolean }) => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(k: string, v: unknown) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  }

  const hasUS = form.countries.includes("US");

  function handleSubmit() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Zone name is required";
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#3a2e24", fontFamily: "'Cormorant Garamond',serif", margin: 0 }}>{title}</h3>

      {/* Name */}
      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#7a5c3a", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Zone Name *</label>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. United States, International"
          style={{
            width: "100%",
            padding: "9px 12px",
            border: `1px solid ${errors.name ? "#dc2626" : "#e0d5c5"}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "'Inter',sans-serif",
            outline: "none",
          }}
        />
        {errors.name && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 3 }}>{errors.name}</p>}
      </div>

      {/* Countries */}
      <MultiSelect
        label="Countries"
        options={COUNTRIES}
        selected={form.countries}
        onChange={(v) => set("countries", v)}
        placeholder="Search countries…"
      />

      {/* US States (shown if US is selected) */}
      {hasUS && (
        <MultiSelect
          label="US States (leave empty for all states)"
          options={US_STATES}
          selected={form.regions}
          onChange={(v) => set("regions", v)}
          placeholder="Search states… (empty = all)"
        />
      )}

      {/* Active */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Toggle value={form.isActive} onChange={(v) => set("isActive", v)} />
        <span style={{ fontSize: 13, color: "#5a4a38" }}>Active</span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #e0d5c5", background: "#fff", color: "#7a5c3a", fontSize: 13, fontFamily: "'Inter',sans-serif", cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save Zone"}
        </button>
      </div>
    </div>
  );
}

// ─── Zone Card ────────────────────────────────────────────────────────────────

function ZoneCard({
  zone,
  onUpdate,
  onDelete,
  onAddRate,
  onUpdateRate,
  onDeleteRate,
}: {
  zone: ShippingZone;
  onUpdate: (id: string, data: Partial<ShippingZone>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddRate: (zoneId: string, data: ReturnType<typeof emptyRateForm>) => Promise<void>;
  onUpdateRate: (zoneId: string, rateId: string, data: ReturnType<typeof emptyRateForm>) => Promise<void>;
  onDeleteRate: (zoneId: string, rateId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingRate, setAddingRate] = useState(false);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function handleToggleActive() {
    setSaving(true);
    await onUpdate(zone.id, { isActive: !zone.isActive });
    setSaving(false);
  }

  async function handleEditSave(data: { name: string; countries: string[]; regions: string[]; isActive: boolean }) {
    setSaving(true);
    await onUpdate(zone.id, data);
    setSaving(false);
    setEditing(false);
  }

  async function handleDelete() {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setSaving(true);
    await onDelete(zone.id);
    setSaving(false);
  }

  async function handleAddRate(data: ReturnType<typeof emptyRateForm>) {
    setSaving(true);
    await onAddRate(zone.id, data);
    setSaving(false);
    setAddingRate(false);
  }

  async function handleUpdateRate(rateId: string, data: ReturnType<typeof emptyRateForm>) {
    setSaving(true);
    await onUpdateRate(zone.id, rateId, data);
    setSaving(false);
    setEditingRateId(null);
  }

  async function handleDeleteRate(rateId: string) {
    setSaving(true);
    await onDeleteRate(zone.id, rateId);
    setSaving(false);
  }

  async function handleToggleRate(rate: ShippingRate) {
    setSaving(true);
    await onUpdateRate(zone.id, rate.id, {
      name: rate.name,
      condition: rate.condition,
      minValue: rate.minValue != null ? String(rate.minValue) : "",
      maxValue: rate.maxValue != null ? String(rate.maxValue) : "",
      price: String(rate.price / 100),
      isActive: !rate.isActive,
    });
    setSaving(false);
  }

  if (editing) {
    return (
      <ZoneForm
        title={`Edit: ${zone.name}`}
        initial={{ name: zone.name, countries: zone.countries, regions: zone.regions, isActive: zone.isActive }}
        onSave={handleEditSave}
        onCancel={() => setEditing(false)}
        saving={saving}
      />
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, overflow: "hidden" }}>
      {/* Zone header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: expanded ? "1px solid #ede8df" : "none" }}>
        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#8a7060", padding: 2, display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        {/* Name + countries */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif" }}>{zone.name}</span>
            {!zone.isActive && (
              <span style={{ fontSize: 11, background: "#f3f4f6", color: "#6b7280", borderRadius: 5, padding: "1px 7px", fontWeight: 500 }}>Inactive</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#9a876e", marginTop: 2 }}>
            {zone.countries.length === 0
              ? "No countries assigned"
              : zone.countries.slice(0, 5).map((c) => countryName(c)).join(", ") +
                (zone.countries.length > 5 ? ` +${zone.countries.length - 5} more` : "")}
            {zone.regions.length > 0 && ` · ${zone.regions.length} US state${zone.regions.length !== 1 ? "s" : ""}`}
          </div>
        </div>

        {/* Rate count */}
        <span style={{ fontSize: 12, color: "#9a876e", whiteSpace: "nowrap" }}>
          {zone._count.rates} rate{zone._count.rates !== 1 ? "s" : ""}
        </span>

        {/* Active toggle */}
        <Toggle value={zone.isActive} onChange={handleToggleActive} />

        {/* Edit */}
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Edit zone"
          style={{ background: "none", border: "1px solid #e0d5c5", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: "#7a5c3a", display: "flex", alignItems: "center", gap: 4 }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
          Edit
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          style={{ background: "none", border: `1px solid ${deleteConfirm ? "#dc2626" : "#e0d5c5"}`, borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: deleteConfirm ? "#dc2626" : "#7a5c3a", display: "flex", alignItems: "center", gap: 4 }}
          onBlur={() => setTimeout(() => setDeleteConfirm(false), 200)}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          {deleteConfirm ? "Confirm?" : "Delete"}
        </button>
      </div>

      {/* Rates section */}
      {expanded && (
        <div style={{ padding: "12px 16px 16px" }}>
          {zone.rates.length === 0 && !addingRate && (
            <p style={{ fontSize: 13, color: "#9a876e", marginBottom: 12, fontStyle: "italic" }}>No rates yet. Add a rate below.</p>
          )}

          {zone.rates.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {/* Rates table header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 80px 80px 100px", gap: 8, padding: "6px 8px", borderBottom: "1px solid #ede8df", marginBottom: 4 }}>
                {["Rate Name", "Condition", "Range", "Price", "Active", "Actions"].map((h) => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                ))}
              </div>

              {zone.rates.map((rate) => (
                <div key={rate.id}>
                  {editingRateId === rate.id ? (
                    <div style={{ marginBottom: 8 }}>
                      <RateForm
                        initial={{
                          name: rate.name,
                          condition: rate.condition,
                          minValue: rate.minValue != null ? String(rate.minValue) : "",
                          maxValue: rate.maxValue != null ? String(rate.maxValue) : "",
                          price: rate.condition === "FREE" ? "0" : String(rate.price / 100),
                          isActive: rate.isActive,
                        }}
                        onSave={(data) => handleUpdateRate(rate.id, data)}
                        onCancel={() => setEditingRateId(null)}
                        saving={saving}
                      />
                    </div>
                  ) : (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 100px 80px 80px 100px",
                      gap: 8,
                      padding: "10px 8px",
                      borderBottom: "1px solid #f5f0ea",
                      alignItems: "center",
                    }}>
                      <span style={{ fontSize: 13, color: "#3a2e24", fontWeight: 500 }}>{rate.name}</span>
                      <span style={{ fontSize: 12, color: "#7a5c3a" }}>{conditionLabel(rate.condition)}</span>
                      <span style={{ fontSize: 12, color: "#9a876e" }}>
                        {rate.condition === "WEIGHT" || rate.condition === "ORDER_VALUE"
                          ? `${rate.minValue ?? "0"}–${rate.maxValue ?? "∞"}`
                          : "—"}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: rate.price === 0 ? "#15803d" : "#3a2e24" }}>
                        {formatRate(rate)}
                      </span>
                      <Toggle value={rate.isActive} onChange={() => handleToggleRate(rate)} />
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => setEditingRateId(rate.id)}
                          style={{ padding: "4px 8px", border: "1px solid #e0d5c5", borderRadius: 5, background: "#fff", cursor: "pointer", fontSize: 11, color: "#7a5c3a" }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRate(rate.id)}
                          style={{ padding: "4px 8px", border: "1px solid #fecaca", borderRadius: 5, background: "#fff", cursor: "pointer", fontSize: 11, color: "#dc2626" }}
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add rate form */}
          {addingRate ? (
            <RateForm
              initial={emptyRateForm()}
              onSave={handleAddRate}
              onCancel={() => setAddingRate(false)}
              saving={saving}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingRate(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                border: "1px dashed #c9a84c",
                borderRadius: 8,
                background: "#fffbf2",
                color: "#8B6914",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "'Inter',sans-serif",
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="M12 5v14" />
              </svg>
              Add Rate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShippingPage() {
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/shipping");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setZones(data.zones);
    } catch {
      showToast("Failed to load shipping zones", true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  async function handleCreateZone(data: { name: string; countries: string[]; regions: string[]; isActive: boolean }) {
    setSavingZone(true);
    try {
      const res = await fetch("/api/admin/shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      const { zone } = await res.json();
      setZones((z) => [...z, zone]);
      setShowZoneForm(false);
      showToast("Shipping zone created");
    } catch {
      showToast("Failed to create zone", true);
    } finally {
      setSavingZone(false);
    }
  }

  async function handleUpdateZone(id: string, data: Partial<ShippingZone>) {
    try {
      const res = await fetch(`/api/admin/shipping/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      const { zone } = await res.json();
      setZones((zs) => zs.map((z) => (z.id === id ? zone : z)));
    } catch {
      showToast("Failed to update zone", true);
      throw new Error("update failed");
    }
  }

  async function handleDeleteZone(id: string) {
    try {
      const res = await fetch(`/api/admin/shipping/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setZones((zs) => zs.filter((z) => z.id !== id));
      showToast("Zone deleted");
    } catch {
      showToast("Failed to delete zone", true);
      throw new Error("delete failed");
    }
  }

  async function handleAddRate(zoneId: string, data: ReturnType<typeof emptyRateForm>) {
    try {
      const price = data.condition === "FREE" ? 0 : Math.round(parseFloat(data.price as string) * 100);
      const minValue = data.minValue !== "" ? (data.condition === "ORDER_VALUE" ? Math.round(parseFloat(data.minValue as string) * 100) : parseFloat(data.minValue as string)) : null;
      const maxValue = data.maxValue !== "" ? (data.condition === "ORDER_VALUE" ? Math.round(parseFloat(data.maxValue as string) * 100) : parseFloat(data.maxValue as string)) : null;

      const res = await fetch(`/api/admin/shipping/${zoneId}/rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, condition: data.condition, minValue, maxValue, price, isActive: data.isActive }),
      });
      if (!res.ok) throw new Error("Failed to add rate");
      const { rate } = await res.json();
      setZones((zs) =>
        zs.map((z) =>
          z.id === zoneId
            ? { ...z, rates: [...z.rates, rate], _count: { rates: z._count.rates + 1 } }
            : z
        )
      );
      showToast("Rate added");
    } catch {
      showToast("Failed to add rate", true);
      throw new Error("add rate failed");
    }
  }

  async function handleUpdateRate(zoneId: string, rateId: string, data: ReturnType<typeof emptyRateForm>) {
    try {
      const price = data.condition === "FREE" ? 0 : Math.round(parseFloat(data.price as string) * 100);
      const minValue = data.minValue !== "" ? (data.condition === "ORDER_VALUE" ? Math.round(parseFloat(data.minValue as string) * 100) : parseFloat(data.minValue as string)) : null;
      const maxValue = data.maxValue !== "" ? (data.condition === "ORDER_VALUE" ? Math.round(parseFloat(data.maxValue as string) * 100) : parseFloat(data.maxValue as string)) : null;

      const res = await fetch(`/api/admin/shipping/${zoneId}/rates/${rateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, condition: data.condition, minValue, maxValue, price, isActive: data.isActive }),
      });
      if (!res.ok) throw new Error("Failed to update rate");
      const { rate } = await res.json();
      setZones((zs) =>
        zs.map((z) =>
          z.id === zoneId ? { ...z, rates: z.rates.map((r) => (r.id === rateId ? rate : r)) } : z
        )
      );
    } catch {
      showToast("Failed to update rate", true);
      throw new Error("update rate failed");
    }
  }

  async function handleDeleteRate(zoneId: string, rateId: string) {
    try {
      const res = await fetch(`/api/admin/shipping/${zoneId}/rates/${rateId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rate");
      setZones((zs) =>
        zs.map((z) =>
          z.id === zoneId
            ? { ...z, rates: z.rates.filter((r) => r.id !== rateId), _count: { rates: z._count.rates - 1 } }
            : z
        )
      );
      showToast("Rate deleted");
    } catch {
      showToast("Failed to delete rate", true);
      throw new Error("delete rate failed");
    }
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');`}</style>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "clamp(22px,4vw,30px)", fontWeight: 600, color: "#3a2e24", fontFamily: "'Cormorant Garamond',serif", margin: 0 }}>
            Shipping Zones
          </h1>
          <p style={{ fontSize: 14, color: "#9a876e", marginTop: 4 }}>
            Configure shipping rates by geographic zone
          </p>
        </div>
        {!showZoneForm && (
          <button
            type="button"
            onClick={() => setShowZoneForm(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 20px",
              border: "none",
              borderRadius: 9,
              background: "#8B6914",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Inter',sans-serif",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(139,105,20,0.25)",
            }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
            Add Zone
          </button>
        )}
      </div>

      {/* New zone form */}
      {showZoneForm && (
        <div style={{ marginBottom: 20 }}>
          <ZoneForm
            title="New Shipping Zone"
            initial={{ name: "", countries: [], regions: [], isActive: true }}
            onSave={handleCreateZone}
            onCancel={() => setShowZoneForm(false)}
            saving={savingZone}
          />
        </div>
      )}

      {/* Zone list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 64, borderRadius: 12, background: "#f0ebe3", animation: "pulse 1.4s ease-in-out infinite" }} />
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
        </div>
      ) : zones.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#9a876e" }}>
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14, opacity: 0.6 }}>
            <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" /><rect x="9" y="11" width="14" height="10" rx="2" /><circle cx="12" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
          </svg>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#5a4a38", fontFamily: "'Cormorant Garamond',serif" }}>No shipping zones yet</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Click "Add Zone" to create your first shipping zone.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {zones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              onUpdate={handleUpdateZone}
              onDelete={handleDeleteZone}
              onAddRate={handleAddRate}
              onUpdateRate={handleUpdateRate}
              onDeleteRate={handleDeleteRate}
            />
          ))}
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
