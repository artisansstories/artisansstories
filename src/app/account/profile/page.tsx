"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Customer = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  acceptsMarketing: boolean;
  totalOrders: number;
  totalSpent: number;
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function ProfilePage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);

  useEffect(() => {
    fetch("/api/account/profile")
      .then(res => {
        if (res.status === 401) { router.replace("/account/login"); return null; }
        return res.json();
      })
      .then(data => {
        if (!data) return;
        const c = data.customer as Customer;
        setCustomer(c);
        setFirstName(c.firstName ?? "");
        setLastName(c.lastName ?? "");
        setPhone(c.phone ?? "");
        setAcceptsMarketing(c.acceptsMarketing ?? false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone, acceptsMarketing }),
      });

      if (res.ok) {
        const data = await res.json();
        setCustomer(data.customer);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save changes.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!customer) return null;

  const inputStyle = {
    width: "100%",
    height: 52,
    padding: "0 16px",
    borderRadius: 10,
    border: "1.5px solid #e0d5c5",
    background: "#fdfaf6",
    fontSize: 15,
    color: "#3a2e24",
    fontFamily: "'Inter',sans-serif",
    outline: "none",
    transition: "border-color 0.15s",
  };

  const labelStyle = {
    display: "block" as const,
    fontSize: 11,
    fontWeight: 600 as const,
    color: "#6b5540",
    fontFamily: "'Inter',sans-serif",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    marginBottom: 7,
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "clamp(24px,4vw,48px) 20px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <a href="/account" style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter',sans-serif", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to account
        </a>
        <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(26px,5vw,38px)", fontWeight: 400, color: "#3a2e24", marginBottom: 6 }}>
          My Profile
        </h1>
        <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter',sans-serif" }}>
          {customer.email}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: "14px 18px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
            Total Orders
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, color: "#8B6914", fontFamily: "'Inter',sans-serif", margin: 0 }}>
            {customer.totalOrders}
          </p>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: "14px 18px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
            Total Spent
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, color: "#8B6914", fontFamily: "'Inter',sans-serif", margin: 0 }}>
            {formatPrice(customer.totalSpent)}
          </p>
        </div>
      </div>

      {/* Form */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #ede8df", padding: "24px 24px 28px" }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, fontWeight: 500, color: "#3a2e24", marginBottom: 20 }}>
          Personal Information
        </h2>

        {error && (
          <div style={{ padding: "11px 16px", borderRadius: 10, background: "#fff5f5", border: "1px solid rgba(220,80,60,0.2)", color: "#c0392b", fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 18 }}>
            {error}
          </div>
        )}

        {saved && (
          <div style={{ padding: "11px 16px", borderRadius: 10, background: "#ecfdf5", border: "1px solid rgba(13,110,63,0.2)", color: "#0d6e3f", fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Profile updated successfully
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
                onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
                onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <div style={{
              ...inputStyle,
              display: "flex",
              alignItems: "center",
              background: "#f5f0e8",
              color: "#9a876e",
              cursor: "default",
            }}>
              <span style={{ fontSize: 15, fontFamily: "'Inter',sans-serif" }}>{customer.email}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#b09878", fontFamily: "'Inter',sans-serif" }}>Cannot change</span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
              onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
            />
          </div>

          {/* Marketing checkbox */}
          <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", padding: "14px 16px", borderRadius: 10, background: acceptsMarketing ? "rgba(139,105,20,0.04)" : "#fdfaf6", border: `1px solid ${acceptsMarketing ? "rgba(139,105,20,0.2)" : "#e8dfd0"}`, transition: "all 0.15s" }}>
            <div
              onClick={() => setAcceptsMarketing(!acceptsMarketing)}
              style={{
                width: 20, height: 20, borderRadius: 5, border: `2px solid ${acceptsMarketing ? "#8B6914" : "#d0c4b0"}`,
                background: acceptsMarketing ? "linear-gradient(135deg, #8B6914, #C9A84C)" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
                transition: "all 0.15s",
              }}
            >
              {acceptsMarketing && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: "0 0 3px" }}>
                Email marketing
              </p>
              <p style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter',sans-serif", margin: 0, lineHeight: 1.5 }}>
                Receive news about new collections, artisan stories, and exclusive offers.
              </p>
            </div>
          </label>

          <button
            type="submit"
            disabled={saving}
            style={{
              width: "100%",
              height: 52,
              borderRadius: 10,
              border: "none",
              background: saving ? "#c8a84c" : "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "'Inter',sans-serif",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.8 : 1,
              boxShadow: "0 3px 14px rgba(139,105,20,0.25)",
              transition: "opacity 0.15s",
              marginTop: 4,
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Sign out */}
      <div style={{ marginTop: 32, textAlign: "center", paddingBottom: 8 }}>
        <a
          href="/api/auth/customer/logout"
          style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter',sans-serif", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          Sign out of your account
        </a>
      </div>

    </div>
  );
}
