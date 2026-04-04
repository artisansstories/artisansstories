"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export default function Home() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Inter:wght@300;400;500&display=swap');

        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html { height:100%; -webkit-text-size-adjust:100%; }
        body { height:100%; }

        @keyframes fadeUp {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity:0; } to { opacity:1; }
        }
        @keyframes glow {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:.4; transform:scale(.8); }
        }

        .a1 { animation: fadeUp .8s ease-out .0s both; }
        .a2 { animation: fadeUp .8s ease-out .2s both; }
        .a3 { animation: fadeUp .8s ease-out .38s both; }
        .a4 { animation: fadeUp .8s ease-out .54s both; }
        .a5 { animation: fadeUp .8s ease-out .7s both; }
        .abg{ animation: fadeIn 1.4s ease-out both; }

        input[type="email"] {
          -webkit-appearance: none;
          appearance: none;
        }
        input::placeholder { color:rgba(255,255,255,0.38); }
        input:focus { outline:none; }

        /* Touch-friendly button */
        .cta-btn {
          width:100%;
          min-height:56px;
          border-radius:14px;
          border:1px solid rgba(210,165,90,0.4);
          background:linear-gradient(135deg,rgba(150,100,50,0.85),rgba(190,130,65,0.85));
          backdrop-filter:blur(16px);
          -webkit-backdrop-filter:blur(16px);
          color:#fff;
          font-size:13px;
          font-weight:500;
          letter-spacing:0.18em;
          text-transform:uppercase;
          font-family:'Inter',sans-serif;
          cursor:pointer;
          transition:opacity .2s, transform .15s;
          box-shadow:0 8px 32px rgba(150,100,50,0.3);
          -webkit-tap-highlight-color:transparent;
        }
        .cta-btn:active { transform:scale(0.98); opacity:.9; }
      `}</style>

      <main style={{
        minHeight:"100dvh",
        position:"relative",
        display:"flex",
        flexDirection:"column",
        alignItems:"center",
        justifyContent:"center",
        overflow:"hidden",
      }}>

        {/* Background */}
        <div className="abg" style={{ position:"absolute", inset:0, zIndex:0 }}>
          <Image
            src="/hero.jpg"
            alt=""
            fill
            style={{ objectFit:"cover", objectPosition:"center center" }}
            priority
            unoptimized
          />
          {/* Overlay — strong at edges, clear in center */}
          <div style={{
            position:"absolute", inset:0,
            background:"linear-gradient(to bottom, rgba(6,8,16,0.78) 0%, rgba(6,8,16,0.42) 28%, rgba(6,8,16,0.42) 72%, rgba(6,8,16,0.82) 100%)",
          }}/>
          {/* Warm center radial to complement gold logo */}
          <div style={{
            position:"absolute", inset:0,
            background:"radial-gradient(ellipse 80% 55% at 50% 46%, rgba(170,120,60,0.13) 0%, transparent 68%)",
          }}/>
        </div>

        {/* ── CONTENT ── */}
        <div style={{
          position:"relative", zIndex:1,
          display:"flex", flexDirection:"column", alignItems:"center",
          /* Mobile: tighter padding, more breathing room */
          padding:"clamp(48px,8vw,80px) clamp(20px,6vw,48px)",
          width:"100%",
          maxWidth:"680px",
          textAlign:"center",
          gap:0,
          opacity: mounted ? 1 : 0,
          transition:"opacity .25s",
        }}>

          {/* Coming Soon badge */}
          <div className="a1" style={{
            display:"inline-flex", alignItems:"center", gap:"8px",
            background:"rgba(255,255,255,0.07)",
            border:"1px solid rgba(255,255,255,0.15)",
            backdropFilter:"blur(12px)",
            WebkitBackdropFilter:"blur(12px)",
            borderRadius:"100px",
            /* Mobile-friendly touch target height */
            padding:"10px 22px",
            marginBottom:"clamp(36px,6vw,52px)",
          }}>
            <div style={{
              width:"7px", height:"7px", borderRadius:"50%",
              background:"#d4956a",
              flexShrink:0,
              animation:"glow 2.5s ease-in-out infinite",
            }}/>
            <span style={{
              fontSize:"11px", fontWeight:"500",
              letterSpacing:"0.2em", textTransform:"uppercase",
              color:"rgba(255,255,255,0.82)",
              fontFamily:"'Inter',sans-serif",
              whiteSpace:"nowrap",
            }}>Coming Soon</span>
          </div>

          {/* Logo — full width on mobile */}
          <div className="a2" style={{
            width:"100%",
            marginBottom:"clamp(28px,5vw,44px)",
          }}>
            <Image
              src="/logo-color.png"
              alt="Artisans' Stories"
              width={560}
              height={187}
              style={{
                /* Mobile: 92% width. Desktop caps at 520px */
                width:"min(92vw,520px)",
                height:"auto",
                filter:"drop-shadow(0 3px 20px rgba(0,0,0,0.6))",
              }}
              priority
              unoptimized
            />
          </div>

          {/* Divider */}
          <div className="a2" style={{
            width:"56px", height:"1px",
            background:"linear-gradient(90deg,transparent,rgba(210,170,100,0.75),transparent)",
            marginBottom:"clamp(28px,5vw,44px)",
          }}/>

          {/* Headline */}
          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            /* Mobile: 22px. Grows to 26px on larger screens */
            fontSize:"clamp(22px,4.5vw,26px)",
            fontWeight:300,
            fontStyle:"italic",
            color:"rgba(255,255,255,0.93)",
            lineHeight:1.7,
            marginBottom:"clamp(16px,3vw,22px)",
            maxWidth:"520px",
          }}>
            Be among the first to join and be part of the journey.
          </p>

          {/* Body 1 */}
          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(18px,3.5vw,21px)",
            fontWeight:300,
            color:"rgba(255,255,255,0.68)",
            lineHeight:1.85,
            marginBottom:"clamp(12px,2vw,16px)",
            maxWidth:"500px",
          }}>
            We&apos;re putting the finishing touches on something special&nbsp;&mdash;&nbsp;handcrafted goods from El Salvador&apos;s most talented artisans.
          </p>

          {/* Body 2 */}
          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(18px,3.5vw,21px)",
            fontWeight:300,
            color:"rgba(255,255,255,0.5)",
            lineHeight:1.85,
            marginBottom:"clamp(40px,6vw,56px)",
            maxWidth:"460px",
          }}>
            Every product has a story, and we are so excited to share those products and stories with you&hellip;
          </p>

          {/* Email form */}
          <div className="a4" style={{ width:"100%", maxWidth:"460px" }}>
            {status === "success" ? (
              <div style={{
                background:"rgba(255,255,255,0.07)",
                border:"1px solid rgba(255,255,255,0.14)",
                backdropFilter:"blur(16px)",
                WebkitBackdropFilter:"blur(16px)",
                borderRadius:"16px",
                padding:"clamp(24px,5vw,36px)",
              }}>
                <div style={{ fontSize:"30px", marginBottom:"12px" }}>✉️</div>
                <p style={{
                  fontFamily:"'Cormorant Garamond',serif",
                  fontSize:"clamp(18px,4vw,21px)",
                  fontStyle:"italic",
                  color:"rgba(255,255,255,0.9)",
                  lineHeight:1.6, margin:0,
                }}>
                  {message}
                </p>
                <p style={{
                  fontFamily:"'Inter',sans-serif",
                  fontSize:"13px",
                  color:"rgba(255,255,255,0.38)",
                  marginTop:"10px",
                  letterSpacing:"0.04em",
                }}>
                  We&apos;ll be in touch when we launch.
                </p>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
                <form onSubmit={handleSubmit} style={{ display:"contents" }}>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Your email address"
                    required
                    autoComplete="email"
                    style={{
                      width:"100%",
                      /* Minimum 56px height — Apple/Android touch target standard */
                      minHeight:"56px",
                      padding:"0 22px",
                      borderRadius:"14px",
                      border:"1px solid rgba(255,255,255,0.17)",
                      background:"rgba(255,255,255,0.08)",
                      backdropFilter:"blur(16px)",
                      WebkitBackdropFilter:"blur(16px)",
                      color:"#fff",
                      fontSize:"16px", /* 16px prevents iOS zoom-in on focus */
                      fontFamily:"'Inter',sans-serif",
                      transition:"border-color .2s, background .2s",
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "rgba(212,149,106,0.6)";
                      e.target.style.background  = "rgba(255,255,255,0.12)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "rgba(255,255,255,0.17)";
                      e.target.style.background  = "rgba(255,255,255,0.08)";
                    }}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="cta-btn"
                    style={{ opacity: status === "loading" ? .6 : 1 }}
                  >
                    {status === "loading" ? "Joining…" : "Notify Me When We Launch"}
                  </button>
                </form>

                {status === "error" && (
                  <p style={{
                    color:"#ffb09c", fontSize:"13px",
                    fontFamily:"'Inter',sans-serif",
                    textAlign:"center",
                  }}>{message}</p>
                )}

                <p className="a5" style={{
                  marginTop:"6px",
                  fontSize:"11px",
                  color:"rgba(255,255,255,0.25)",
                  fontFamily:"'Inter',sans-serif",
                  letterSpacing:"0.07em",
                  textTransform:"uppercase",
                }}>
                  No spam, ever &nbsp;·&nbsp; Just our launch announcement
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Footer — safe area aware */}
        <div style={{
          position:"absolute", bottom:0, left:0, right:0,
          paddingBottom:"max(16px, env(safe-area-inset-bottom))",
          paddingTop:"12px",
          textAlign:"center", zIndex:1,
        }}>
          <p style={{
            fontSize:"10px",
            color:"rgba(255,255,255,0.16)",
            fontFamily:"'Inter',sans-serif",
            letterSpacing:"0.08em",
            textTransform:"uppercase",
          }}>
            © {new Date().getFullYear()} Artisans&apos; Stories · El Salvador
          </p>
        </div>

      </main>
    </>
  );
}
