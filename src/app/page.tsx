"use client";

import { useState } from "react";
import Image from "next/image";

export default function Home() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage("Thank you — you're on the list. We'll be in touch soon.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #fdf8f3 0%, #f5ede0 50%, #faf5ee 100%)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Georgia', 'Garamond', serif",
    }}>

      {/* Subtle texture overlay */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23a0745a' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        zIndex: 0,
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Top decorative line */}
        <div style={{ height: "3px", background: "linear-gradient(90deg, transparent, #8b5e3c, #c8956c, #8b5e3c, transparent)" }} />

        {/* Main content */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 24px",
          maxWidth: "680px",
          margin: "0 auto",
          width: "100%",
          textAlign: "center",
        }}>

          {/* Coming Soon badge */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(139,94,60,0.08)",
            border: "1px solid rgba(139,94,60,0.2)",
            borderRadius: "100px",
            padding: "6px 20px",
            marginBottom: "40px",
          }}>
            <div style={{
              width: "6px", height: "6px",
              borderRadius: "50%",
              background: "#8b5e3c",
              animation: "pulse 2s infinite",
            }} />
            <span style={{
              fontSize: "11px",
              fontWeight: "700",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#8b5e3c",
              fontFamily: "system-ui, sans-serif",
            }}>
              Coming Soon
            </span>
          </div>

          {/* Logo */}
          <div style={{ marginBottom: "48px" }}>
            <Image
              src="/logo-web.webp"
              alt="Artisans of Stories"
              width={480}
              height={120}
              style={{
                width: "min(480px, 90vw)",
                height: "auto",
                filter: "invert(1) sepia(0.3) saturate(0.8) brightness(0.4)",
              }}
              priority
            />
          </div>

          {/* Divider */}
          <div style={{
            width: "60px", height: "1px",
            background: "linear-gradient(90deg, transparent, #c8956c, transparent)",
            marginBottom: "40px",
          }} />

          {/* Main copy */}
          <p style={{
            fontSize: "clamp(17px, 3vw, 20px)",
            color: "#4a3728",
            lineHeight: "1.8",
            marginBottom: "16px",
            fontStyle: "italic",
          }}>
            Be among the first to join and be part of the journey.
          </p>

          <p style={{
            fontSize: "clamp(14px, 2.5vw, 16px)",
            color: "#7a5c44",
            lineHeight: "1.85",
            marginBottom: "12px",
            maxWidth: "520px",
          }}>
            We&apos;re putting the finishing touches on something special — handcrafted goods from El Salvador&apos;s most talented artisans.
          </p>

          <p style={{
            fontSize: "clamp(14px, 2.5vw, 16px)",
            color: "#7a5c44",
            lineHeight: "1.85",
            marginBottom: "48px",
            maxWidth: "520px",
          }}>
            Every product has a story, and we are so excited to share those products and stories with you&hellip;
          </p>

          {/* Email form */}
          {status === "success" ? (
            <div style={{
              background: "rgba(139,94,60,0.07)",
              border: "1px solid rgba(139,94,60,0.25)",
              borderRadius: "12px",
              padding: "24px 32px",
              maxWidth: "460px",
              width: "100%",
            }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>✉️</div>
              <p style={{
                color: "#5a3e2b",
                fontSize: "15px",
                lineHeight: "1.6",
                margin: 0,
                fontStyle: "italic",
              }}>
                {message}
              </p>
            </div>
          ) : (
            <div style={{ width: "100%", maxWidth: "460px" }}>
              <form onSubmit={handleSubmit} style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  required
                  style={{
                    width: "100%",
                    padding: "16px 20px",
                    borderRadius: "10px",
                    border: "1px solid rgba(139,94,60,0.25)",
                    background: "rgba(255,255,255,0.8)",
                    color: "#3a2616",
                    fontSize: "15px",
                    outline: "none",
                    fontFamily: "system-ui, sans-serif",
                    boxSizing: "border-box",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(139,94,60,0.6)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(139,94,60,0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(139,94,60,0.25)";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  style={{
                    width: "100%",
                    padding: "16px 20px",
                    borderRadius: "10px",
                    border: "none",
                    background: status === "loading"
                      ? "rgba(139,94,60,0.5)"
                      : "linear-gradient(135deg, #8b5e3c, #a0745a)",
                    color: "#fdf8f3",
                    fontSize: "14px",
                    fontWeight: "600",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    cursor: status === "loading" ? "not-allowed" : "pointer",
                    fontFamily: "system-ui, sans-serif",
                    transition: "opacity 0.2s, transform 0.15s",
                    boxShadow: "0 4px 20px rgba(139,94,60,0.25)",
                  }}
                  onMouseEnter={(e) => {
                    if (status !== "loading") {
                      (e.target as HTMLButtonElement).style.opacity = "0.9";
                      (e.target as HTMLButtonElement).style.transform = "translateY(-1px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.opacity = "1";
                    (e.target as HTMLButtonElement).style.transform = "translateY(0)";
                  }}
                >
                  {status === "loading" ? "Joining..." : "Notify Me When We Launch"}
                </button>
              </form>

              {status === "error" && (
                <p style={{
                  marginTop: "10px",
                  color: "#c0392b",
                  fontSize: "13px",
                  fontFamily: "system-ui, sans-serif",
                }}>
                  {message}
                </p>
              )}

              <p style={{
                marginTop: "14px",
                fontSize: "12px",
                color: "#a89070",
                fontFamily: "system-ui, sans-serif",
                letterSpacing: "0.02em",
              }}>
                No spam, ever. Just our launch announcement.
              </p>
            </div>
          )}

        </div>

        {/* Footer */}
        <footer style={{
          textAlign: "center",
          padding: "24px",
          borderTop: "1px solid rgba(139,94,60,0.1)",
        }}>
          <p style={{
            fontSize: "12px",
            color: "#b8967a",
            fontFamily: "system-ui, sans-serif",
            letterSpacing: "0.05em",
            margin: 0,
          }}>
            © {new Date().getFullYear()} Artisans Stories · Handcrafted with care from El Salvador
          </p>
        </footer>

        {/* Bottom decorative line */}
        <div style={{ height: "3px", background: "linear-gradient(90deg, transparent, #8b5e3c, #c8956c, #8b5e3c, transparent)" }} />
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::placeholder { color: #b8967a; opacity: 1; }
      `}</style>
    </main>
  );
}
