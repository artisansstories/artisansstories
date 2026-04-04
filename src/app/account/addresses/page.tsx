"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Address = {
  id: string;
  type: string;
  firstName: string;
  lastName: string;
  company?: string | null;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  stateCode: string;
  zip: string;
  country: string;
  countryCode: string;
  phone?: string | null;
  isDefault: boolean;
};

type AddressFormData = {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  stateCode: string;
  zip: string;
  country: string;
  countryCode: string;
  phone: string;
  isDefault: boolean;
};

const EMPTY_FORM: AddressFormData = {
  firstName: "",
  lastName: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  stateCode: "",
  zip: "",
  country: "United States",
  countryCode: "US",
  phone: "",
  isDefault: false,
};

function AddressForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: AddressFormData;
  onSave: (data: AddressFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AddressFormData>(initial);

  function set(key: keyof AddressFormData, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const inputStyle = {
    width: "100%",
    height: 48,
    padding: "0 14px",
    borderRadius: 10,
    border: "1.5px solid #e0d5c5",
    background: "#fdfaf6",
    fontSize: 14,
    color: "#3a2e24",
    fontFamily: "'Inter',sans-serif",
    outline: "none",
  };

  const labelStyle = {
    display: "block" as const,
    fontSize: 11,
    fontWeight: 600 as const,
    color: "#6b5540",
    fontFamily: "'Inter',sans-serif",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    marginBottom: 6,
  };

  return (
    <form
      onSubmit={e => { e.preventDefault(); onSave(form); }}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>First Name *</label>
          <input type="text" required value={form.firstName} onChange={e => set("firstName", e.target.value)} style={inputStyle}
            onFocus={e => { e.target.style.borderColor = "#8B6914"; }} onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }} />
        </div>
        <div>
          <label style={labelStyle}>Last Name *</label>
          <input type="text" required value={form.lastName} onChange={e => set("lastName", e.target.value)} style={inputStyle}
            onFocus={e => { e.target.style.borderColor = "#8B6914"; }} onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Company (optional)</label>
        <input type="text" value={form.company} onChange={e => set("company", e.target.value)} style={inputStyle}
          onFocus={e => { e.target.style.borderColor = "#8B6914"; }} onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }} />
      </div>

      <div>
        <label style={labelStyle}>Address Line 1 *</label>
        <input type="text" required value={form.address1} onChange={e => set("address1", e.target.value)} style={inputStyle}
          onFocus={e => { e.target.style.borderColor = "#8B6914"; }} onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }} />
      </div>

      <div>
        <label style={labelStyle}>Address Line 2 (optional)</label>
        <input type="text" value={form.address2} onChange={e => set("address2", e.target.value)} style={inputStyle}
          onFocus={e => { e.target.style.borderColor = "#8B6914"; }} onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>City *</label>
          <input type="text" required value={form.city} onChange={e => set("city", e.target.value)} style={inputStyle}
            onFocus={e => { e.target.style.borderColor = "#8B6914"; }} onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }} />
        </div>
        <div>
          <label style={labelStyle}>State *</label>
          <input type="text" required value={form.stateCode} onChange={e => { set("stateCode", e.target.value.toUpperCase()); set("state", e.target.value.toUpperCase()); }} placeholder="CA" maxLength={2} style={{ ...inputStyle, textTransform: "uppercase" }}
            onFocus={e => { e.target.style.borderColor = "#8B6914"; }} onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }} />
        </div>
        <div>
          <label style={labelStyle}>ZIP *</label>
          <input type="text" required value={form.zip} onChange={e => set("zip", e.target.value)} style={inputStyle}
            onFocus={e => { e.target.style.borderColor = "#8B6914"; }} onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Phone (optional)</label>
        <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} style={inputStyle}
          onFocus={e => { e.target.style.borderColor = "#8B6914"; }} onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }} />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
        <div
          onClick={() => set("isDefault", !form.isDefault)}
          style={{
            width: 20, height: 20, borderRadius: 5, border: `2px solid ${form.isDefault ? "#8B6914" : "#d0c4b0"}`,
            background: form.isDefault ? "linear-gradient(135deg, #8B6914, #C9A84C)" : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            transition: "all 0.15s",
          }}
        >
          {form.isDefault && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <span style={{ fontSize: 14, color: "#3a2e24", fontFamily: "'Inter',sans-serif" }}>
          Set as default address
        </span>
      </label>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={{
          padding: "10px 20px", borderRadius: 8, border: "1.5px solid #e0d5c5", background: "transparent",
          color: "#6b5540", fontSize: 13, fontFamily: "'Inter',sans-serif", cursor: "pointer",
        }}>
          Cancel
        </button>
        <button type="submit" disabled={saving} style={{
          padding: "10px 24px", borderRadius: 8, border: "none",
          background: saving ? "#c8a84c" : "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)",
          color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif",
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.8 : 1,
          boxShadow: "0 2px 8px rgba(139,105,20,0.25)",
        }}>
          {saving ? "Saving…" : "Save Address"}
        </button>
      </div>
    </form>
  );
}

export default function AddressesPage() {
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/addresses")
      .then(res => {
        if (res.status === 401) { router.replace("/account/login"); return null; }
        return res.json();
      })
      .then(data => {
        if (data) setAddresses(data.addresses ?? []);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [router]);

  async function handleAdd(data: AddressFormData) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        if (data.isDefault) {
          setAddresses(prev => prev.map(a => ({ ...a, isDefault: false })).concat(result.address));
        } else {
          setAddresses(prev => [...prev, result.address]);
        }
        setShowAddForm(false);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to save address.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSaving(false);
  }

  async function handleEdit(id: string, data: AddressFormData) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/account/addresses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        setAddresses(prev => {
          let updated = prev.map(a => a.id === id ? result.address : a);
          if (data.isDefault) {
            updated = updated.map(a => a.id !== id ? { ...a, isDefault: false } : a);
          }
          return updated;
        });
        setEditingId(null);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to update address.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/account/addresses/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAddresses(prev => prev.filter(a => a.id !== id));
      } else {
        setError("Failed to delete address.");
      }
    } catch {
      setError("Network error.");
    }
    setDeletingId(null);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "clamp(24px,4vw,48px) 20px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
        <div>
          <a href="/account" style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter',sans-serif", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to account
          </a>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(26px,5vw,38px)", fontWeight: 400, color: "#3a2e24", marginBottom: 6 }}>
            Addresses
          </h1>
          <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter',sans-serif" }}>
            {addresses.length === 0 ? "No saved addresses" : `${addresses.length} saved address${addresses.length !== 1 ? "es" : ""}`}
          </p>
        </div>

        {!showAddForm && (
          <button
            onClick={() => { setShowAddForm(true); setEditingId(null); }}
            style={{
              padding: "12px 22px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Inter',sans-serif",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(139,105,20,0.25)",
              whiteSpace: "nowrap",
            }}
          >
            + Add Address
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fff5f5", border: "1px solid rgba(220,80,60,0.2)", color: "#c0392b", fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid rgba(139,105,20,0.2)", padding: "24px", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, fontWeight: 500, color: "#3a2e24", marginBottom: 20 }}>
            New Address
          </h2>
          <AddressForm
            initial={EMPTY_FORM}
            onSave={handleAdd}
            onCancel={() => setShowAddForm(false)}
            saving={saving}
          />
        </div>
      )}

      {/* Address list */}
      {addresses.length === 0 && !showAddForm ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #ede8df", padding: "60px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📍</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 400, color: "#3a2e24", marginBottom: 10 }}>
            No addresses yet
          </h2>
          <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter',sans-serif", marginBottom: 24 }}>
            Save your shipping address for faster checkout.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "'Inter',sans-serif", cursor: "pointer", boxShadow: "0 2px 10px rgba(139,105,20,0.25)" }}
          >
            Add Your First Address
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {addresses.map(addr => (
            <div
              key={addr.id}
              style={{
                background: "#fff",
                borderRadius: 16,
                border: `1px solid ${addr.isDefault ? "rgba(139,105,20,0.3)" : "#ede8df"}`,
                overflow: "hidden",
              }}
            >
              {editingId === addr.id ? (
                <div style={{ padding: "20px 24px" }}>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, fontWeight: 500, color: "#3a2e24", marginBottom: 18 }}>
                    Edit Address
                  </h3>
                  <AddressForm
                    initial={{
                      firstName: addr.firstName,
                      lastName: addr.lastName,
                      company: addr.company ?? "",
                      address1: addr.address1,
                      address2: addr.address2 ?? "",
                      city: addr.city,
                      state: addr.state,
                      stateCode: addr.stateCode,
                      zip: addr.zip,
                      country: addr.country,
                      countryCode: addr.countryCode,
                      phone: addr.phone ?? "",
                      isDefault: addr.isDefault,
                    }}
                    onSave={data => handleEdit(addr.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                </div>
              ) : (
                <div style={{ padding: "18px 22px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      {addr.isDefault && (
                        <span style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 20,
                          background: "rgba(139,105,20,0.1)",
                          color: "#8B6914",
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: "'Inter',sans-serif",
                          letterSpacing: "0.04em",
                          marginBottom: 8,
                        }}>
                          Default
                        </span>
                      )}
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", marginBottom: 4 }}>
                        {addr.firstName} {addr.lastName}
                        {addr.company && <span style={{ fontWeight: 400, color: "#7a6852" }}> &middot; {addr.company}</span>}
                      </p>
                      <p style={{ fontSize: 13, color: "#6b5540", fontFamily: "'Inter',sans-serif", lineHeight: 1.6, margin: 0 }}>
                        {addr.address1}{addr.address2 ? `, ${addr.address2}` : ""}<br />
                        {addr.city}, {addr.stateCode} {addr.zip}<br />
                        {addr.country}
                        {addr.phone && <><br />{addr.phone}</>}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => { setEditingId(addr.id); setShowAddForm(false); }}
                        style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", color: "#5a4a38", fontSize: 12, fontFamily: "'Inter',sans-serif", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("Delete this address?")) {
                            handleDelete(addr.id);
                          }
                        }}
                        disabled={deletingId === addr.id}
                        style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(220,80,60,0.25)", background: "transparent", color: "#c0392b", fontSize: 12, fontFamily: "'Inter',sans-serif", cursor: deletingId === addr.id ? "not-allowed" : "pointer", opacity: deletingId === addr.id ? 0.6 : 1 }}
                      >
                        {deletingId === addr.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
