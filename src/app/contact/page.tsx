"use client";

import { useState } from "react";
import ShopNav from "@/components/ShopNav";
import ShopFooter from "@/components/ShopFooter";
import { CartDrawerProvider } from "@/components/CartDrawerProvider";
import CartDrawer from "@/components/CartDrawer";

const SUBJECTS = [
  "Order Question",
  "Product Question",
  "Wholesale Inquiry",
  "General",
];

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 8,
  border: "1px solid #e0d5c5",
  fontFamily: "'Inter', sans-serif",
  fontSize: 15,
  color: "#3a2e24",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "General", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again or email us directly.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CartDrawerProvider>
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#faf7f2" }}>
        <ShopNav />
        <CartDrawer />

        <main style={{ flex: 1 }}>
          <style>{`
            input:focus, textarea:focus, select:focus { border-color: #8B6914 !important; box-shadow: 0 0 0 3px rgba(139,105,20,0.1); }
          `}</style>

          <section style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 80px" }}>
            <div style={{ marginBottom: 40, textAlign: "center" }}>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 13, fontWeight: 500, color: "#C9A84C", letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 10px" }}>
                Get in Touch
              </p>
              <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(36px,5vw,54px)", fontWeight: 600, color: "#3a2e24", margin: 0 }}>
                Contact Us
              </h1>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 48, alignItems: "start" }}>

              {/* Contact Info */}
              <div>
                <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "32px 28px" }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 600, color: "#3a2e24", margin: "0 0 20px" }}>
                    How to reach us
                  </h2>

                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 6px" }}>Email</p>
                    <a href="mailto:hello@artisansstories.com" style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, color: "#8B6914", textDecoration: "none" }}>
                      hello@artisansstories.com
                    </a>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 6px" }}>Social</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <a href="https://www.instagram.com/artisansstories" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#5a4a38", textDecoration: "none" }}>
                        Instagram → @artisansstories
                      </a>
                      <a href="https://www.tiktok.com/@artisansstories" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#5a4a38", textDecoration: "none" }}>
                        TikTok → @artisansstories
                      </a>
                    </div>
                  </div>

                  <div style={{ marginTop: 24, padding: "16px", background: "#faf7f2", borderRadius: 10, border: "1px solid #ede8df" }}>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#7a6a58", margin: 0, lineHeight: 1.6 }}>
                      We respond within <strong>1–2 business days</strong>. For order-related questions, please have your order number ready.
                    </p>
                  </div>
                </div>
              </div>

              {/* Form */}
              <div>
                <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "36px 36px" }}>
                  {sent ? (
                    <div style={{ textAlign: "center", padding: "32px 0" }}>
                      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>
                        ✓
                      </div>
                      <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 600, color: "#3a2e24", margin: "0 0 10px" }}>Message Sent!</h3>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, color: "#5a4a38", margin: "0 0 24px" }}>
                        Thanks for reaching out. We&apos;ll get back to you within 1–2 business days.
                      </p>
                      <button onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "General", message: "" }); }}
                        style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 14, cursor: "pointer", color: "#5a4a38" }}>
                        Send another message
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit}>
                      {error && (
                        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 14px", marginBottom: 20 }}>
                          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#dc2626", margin: 0 }}>{error}</p>
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                        <div>
                          <label style={{ display: "block", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500, color: "#5a4a38", marginBottom: 6 }}>
                            Name <span style={{ color: "#dc2626" }}>*</span>
                          </label>
                          <input style={INPUT_STYLE} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Your name" required />
                        </div>
                        <div>
                          <label style={{ display: "block", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500, color: "#5a4a38", marginBottom: 6 }}>
                            Email <span style={{ color: "#dc2626" }}>*</span>
                          </label>
                          <input style={INPUT_STYLE} type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="your@email.com" required />
                        </div>
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500, color: "#5a4a38", marginBottom: 6 }}>
                          Subject
                        </label>
                        <select style={INPUT_STYLE} value={form.subject} onChange={(e) => update("subject", e.target.value)}>
                          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>

                      <div style={{ marginBottom: 24 }}>
                        <label style={{ display: "block", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500, color: "#5a4a38", marginBottom: 6 }}>
                          Message <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <textarea
                          style={{ ...INPUT_STYLE, minHeight: 140, resize: "vertical" }}
                          value={form.message}
                          onChange={(e) => update("message", e.target.value)}
                          placeholder="Tell us how we can help…"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        style={{ width: "100%", padding: "13px", borderRadius: 8, border: "none", background: submitting ? "#c9b07a" : "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 16, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", transition: "background 0.15s" }}
                        onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLElement).style.background = "#7a5c12"; }}
                        onMouseLeave={(e) => { if (!submitting) (e.currentTarget as HTMLElement).style.background = "#8B6914"; }}
                      >
                        {submitting ? "Sending…" : "Send Message"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>

        <ShopFooter />
      </div>
    </CartDrawerProvider>
  );
}
