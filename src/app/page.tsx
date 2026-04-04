"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export default function Home() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        setMessage("Thank you — you're on the list.");
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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Inter:wght@300;400;500&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        .animate-1 { animation: fadeUp 0.9s ease-out 0.1s both; }
        .animate-2 { animation: fadeUp 0.9s ease-out 0.35s both; }
        .animate-3 { animation: fadeUp 0.9s ease-out 0.55s both; }
        .animate-4 { animation: fadeUp 0.9s ease-out 0.75s both; }
        .animate-5 { animation: fadeUp 0.9s ease-out 0.95s both; }
        .animate-bg { animation: fadeIn 1.4s ease-out both; }

        input::placeholder { color: rgba(255,255,255,0.45); }
        input:focus { outline: none; }
        button:hover { transform: translateY(-1px); }
        button:active { transform: translateY(0); }
      `}</style>

      <main style={{
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}>

        {/* Full-bleed background image */}
        <div className="animate-bg" style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <Image
            src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&q=85&auto=format&fit=crop"
            alt="Artisan hands weaving"
            fill
            style={{ objectFit: "cover", objectPosition: "center 40%" }}
            priority
            unoptimized
          />
          {/* Multi-layer overlay for depth and readability */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(15,8,3,0.35) 0%, rgba(15,8,3,0.55) 40%, rgba(15,8,3,0.75) 75%, rgba(15,8,3,0.88) 100%)",
          }} />
          {/* Warm color tint */}
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at 50% 60%, rgba(120,60,20,0.25) 0%, transparent 70%)",
          }} />
        </div>

        {/* Content */}
        <div style={{
          position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "60px 24px",
          width: "100%", maxWidth: "720px",
          textAlign: "center",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.3s",
        }}>

          {/* Coming Soon pill */}
          <div className="animate-1" style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(12px)",
            borderRadius: "100px",
            padding: "7px 22px",
            marginBottom: "44px",
          }}>
            <div style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: "#d4956a",
              animation: "pulse 2.5s ease-in-out infinite",
            }} />
            <span style={{
              fontSize: "10px", fontWeight: "500",
              letterSpacing: "0.22em", textTransform: "uppercase",
              color: "rgba(255,255,255,0.85)",
              fontFamily: "'Inter', sans-serif",
            }}>
              Coming Soon
            </span>
          </div>

          {/* Logo */}
          <div className="animate-2" style={{ marginBottom: "36px" }}>
            <Image
              src="/logo-color.png"
              alt="Artisans' Stories"
              width={440}
              height={147}
              style={{
                width: "min(440px, 85vw)",
                height: "auto",
                filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.4))",
              }}
              priority
              unoptimized
            />
          </div>

          {/* Gold divider */}
          <div className="animate-2" style={{
            width: "56px", height: "1px",
            background: "linear-gradient(90deg, transparent, #c8956c, transparent)",
            marginBottom: "36px",
          }} />

          {/* Headline */}
          <h1 className="animate-3" style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(16px, 3vw, 20px)",
            fontWeight: 300,
            fontStyle: "italic",
            color: "rgba(255,255,255,0.9)",
            lineHeight: 1.85,
            letterSpacing: "0.02em",
            marginBottom: "14px",
            maxWidth: "560px",
          }}>
            Be among the first to join and be part of the journey.
          </h1>

          <p className="animate-3" style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(15px, 2.5vw, 17px)",
            fontWeight: 300,
            color: "rgba(255,255,255,0.65)",
            lineHeight: 1.9,
            marginBottom: "12px",
            maxWidth: "520px",
          }}>
            We&apos;re putting the finishing touches on something special — handcrafted goods from El Salvador&apos;s most talented artisans.
          </p>

          <p className="animate-3" style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(15px, 2.5vw, 17px)",
            fontWeight: 300,
            color: "rgba(255,255,255,0.55)",
            lineHeight: 1.9,
            marginBottom: "52px",
            maxWidth: "480px",
          }}>
            Every product has a story, and we are so excited to share those products and stories with you&hellip;
          </p>

          {/* Email form */}
          <div className="animate-4" style={{ width: "100%", maxWidth: "460px" }}>
            {status === "success" ? (
              <div style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.15)",
                backdropFilter: "blur(16px)",
                borderRadius: "14px",
                padding: "28px 32px",
              }}>
                <div style={{ fontSize: "26px", marginBottom: "10px" }}>✉️</div>
                <p style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "17px",
                  fontStyle: "italic",
                  color: "rgba(255,255,255,0.88)",
                  lineHeight: 1.6,
                  margin: 0,
                }}>
                  {message}<br/>
                  <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", fontStyle: "normal", fontFamily: "'Inter', sans-serif" }}>
                    We&apos;ll be in touch when we launch.
                  </span>
                </p>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email address"
                    required
                    style={{
                      width: "100%",
                      padding: "17px 22px",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.08)",
                      backdropFilter: "blur(16px)",
                      color: "#fff",
                      fontSize: "15px",
                      fontFamily: "'Inter', sans-serif",
                      transition: "border-color 0.2s, background 0.2s",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "rgba(200,149,108,0.7)";
                      e.target.style.background = "rgba(255,255,255,0.12)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255,255,255,0.2)";
                      e.target.style.background = "rgba(255,255,255,0.08)";
                    }}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    style={{
                      width: "100%",
                      padding: "17px 22px",
                      borderRadius: "12px",
                      border: "1px solid rgba(200,149,108,0.5)",
                      background: "linear-gradient(135deg, rgba(139,94,60,0.85), rgba(180,120,70,0.85))",
                      backdropFilter: "blur(16px)",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: "500",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      fontFamily: "'Inter', sans-serif",
                      cursor: status === "loading" ? "not-allowed" : "pointer",
                      opacity: status === "loading" ? 0.7 : 1,
                      transition: "transform 0.15s, opacity 0.15s",
                      boxShadow: "0 8px 32px rgba(139,94,60,0.35)",
                    }}
                  >
                    {status === "loading" ? "Joining..." : "Notify Me When We Launch"}
                  </button>
                </form>

                {status === "error" && (
                  <p style={{
                    marginTop: "10px", color: "#ffb09c",
                    fontSize: "13px", fontFamily: "'Inter', sans-serif",
                  }}>
                    {message}
                  </p>
                )}

                <p className="animate-5" style={{
                  marginTop: "16px",
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.3)",
                  fontFamily: "'Inter', sans-serif",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}>
                  No spam, ever · Just our launch announcement
                </p>
              </>
            )}
          </div>

        </div>

        {/* Bottom footer */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "20px 24px",
          display: "flex", justifyContent: "center",
          zIndex: 1,
        }}>
          <p style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.2)",
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            © {new Date().getFullYear()} Artisans Stories · El Salvador
          </p>
        </div>

      </main>
    </>
  );
}
