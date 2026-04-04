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
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes glow {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:.4; transform:scale(.8); }
        }

        .a1 { animation: fadeUp .8s ease-out .0s both; }
        .a2 { animation: fadeUp .8s ease-out .2s both; }
        .a3 { animation: fadeUp .8s ease-out .38s both; }
        .a4 { animation: fadeUp .8s ease-out .54s both; }
        .a5 { animation: fadeUp .8s ease-out .7s both; }
        .abg{ animation: fadeIn 1.2s ease-out both; }

        input[type="email"] { -webkit-appearance:none; appearance:none; }
        input::placeholder { color:rgba(100,70,45,0.4); }
        input:focus { outline:none; }

        .cta-btn {
          width:100%; min-height:56px;
          border-radius:14px;
          border:1px solid rgba(139,94,60,0.35);
          background:linear-gradient(135deg,#8b5e3c,#a57248);
          color:#fff;
          font-size:13px; font-weight:500;
          letter-spacing:0.18em; text-transform:uppercase;
          font-family:'Inter',sans-serif;
          cursor:pointer;
          transition:opacity .2s, transform .15s;
          box-shadow:0 6px 28px rgba(139,94,60,0.28);
          -webkit-tap-highlight-color:transparent;
        }
        .cta-btn:active { transform:scale(0.98); opacity:.9; }
        .cta-btn:hover  { opacity:.88; transform:translateY(-1px); }

        .social-icon {
          display:flex; align-items:center; justify-content:center;
          width:48px; height:48px; border-radius:50%;
          background:rgba(139,94,60,0.08);
          border:1px solid rgba(139,94,60,0.2);
          color:rgba(100,65,35,0.7);
          transition:background .2s, color .2s;
          text-decoration:none;
          -webkit-tap-highlight-color:transparent;
        }
        .social-icon:hover {
          background:rgba(139,94,60,0.15);
          color:rgba(80,45,15,1);
        }
      `}</style>

      <main style={{
        minHeight:"100dvh",
        position:"relative",
        display:"flex",
        flexDirection:"column",
        alignItems:"center",
        justifyContent:"center",
        overflow:"hidden",
        background:"linear-gradient(160deg,#fdf8f3 0%,#f5ede0 50%,#faf5ee 100%)",
      }}>

        {/* Texture overlay */}
        <div style={{
          position:"absolute", inset:0, zIndex:0, pointerEvents:"none",
          backgroundImage:"url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23a0745a' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E\")",
        }}/>

        {/* Top accent line */}
        <div style={{ position:"absolute", top:0, left:0, right:0, height:"3px", zIndex:1,
          background:"linear-gradient(90deg,transparent,#8b5e3c,#c8956c,#8b5e3c,transparent)" }}/>

        {/* Content */}
        <div style={{
          position:"relative", zIndex:1,
          display:"flex", flexDirection:"column", alignItems:"center",
          padding:"clamp(52px,8vw,80px) clamp(20px,6vw,48px)",
          width:"100%", maxWidth:"680px",
          textAlign:"center",
          opacity: mounted ? 1 : 0,
          transition:"opacity .25s",
        }}>

          {/* Coming Soon badge */}
          <div className="a1" style={{
            display:"inline-flex", alignItems:"center", gap:"8px",
            background:"rgba(139,94,60,0.08)",
            border:"1px solid rgba(139,94,60,0.2)",
            borderRadius:"100px",
            padding:"10px 22px",
            marginBottom:"clamp(36px,6vw,48px)",
          }}>
            <div style={{
              width:"7px", height:"7px", borderRadius:"50%",
              background:"#8b5e3c", flexShrink:0,
              animation:"glow 2.5s ease-in-out infinite",
            }}/>
            <span style={{
              fontSize:"11px", fontWeight:"500",
              letterSpacing:"0.2em", textTransform:"uppercase",
              color:"#8b5e3c", fontFamily:"'Inter',sans-serif",
              whiteSpace:"nowrap",
            }}>Coming Soon</span>
          </div>

          {/* Logo */}
          <div className="a2" style={{
            marginBottom:"clamp(28px,5vw,40px)",
            width:"100%",
            display:"flex",
            justifyContent:"center",
          }}>
            <Image
              src="/logo-color.png"
              alt="Artisans' Stories"
              width={1748}
              height={470}
              style={{
                width:"min(88vw,500px)",
                height:"auto",
                display:"block",
              }}
              priority
              unoptimized
            />
          </div>

          {/* Divider */}
          <div className="a2" style={{
            width:"56px", height:"1px",
            background:"linear-gradient(90deg,transparent,#c8956c,transparent)",
            marginBottom:"clamp(28px,5vw,40px)",
          }}/>

          {/* Headline */}
          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(21px,4vw,26px)",
            fontWeight:300, fontStyle:"italic",
            color:"#4a3728", lineHeight:1.7,
            marginBottom:"clamp(14px,3vw,20px)",
            maxWidth:"520px",
          }}>
            Be among the first to join and be part of the journey.
          </p>

          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(17px,3vw,20px)",
            fontWeight:300, color:"#7a5c44", lineHeight:1.9,
            marginBottom:"clamp(10px,2vw,14px)",
            maxWidth:"500px",
          }}>
            We&apos;re putting the finishing touches on something special&nbsp;&mdash;&nbsp;handcrafted goods from El Salvador&apos;s most talented artisans.
          </p>

          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(17px,3vw,20px)",
            fontWeight:300, color:"rgba(122,92,68,0.65)", lineHeight:1.9,
            marginBottom:"clamp(36px,6vw,48px)",
            maxWidth:"460px",
          }}>
            Every product has a story, and we are so excited to share those products and stories with you&hellip;
          </p>

          {/* Social icons */}
          <div className="a4" style={{
            display:"flex", alignItems:"center", justifyContent:"center",
            gap:"clamp(18px,4vw,28px)",
            marginBottom:"clamp(36px,6vw,48px)",
          }}>
            <a href="#" aria-label="Instagram" className="social-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <circle cx="12" cy="12" r="4.5"/>
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </a>
            <a href="#" aria-label="Facebook" className="social-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
              </svg>
            </a>
            <a href="#" aria-label="TikTok" className="social-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
              </svg>
            </a>
          </div>

          {/* Email form */}
          <div className="a5" style={{ width:"100%", maxWidth:"460px" }}>
            {status === "success" ? (
              <div style={{
                background:"rgba(139,94,60,0.06)",
                border:"1px solid rgba(139,94,60,0.2)",
                borderRadius:"16px",
                padding:"clamp(24px,5vw,36px)",
                textAlign:"center",
              }}>
                <div style={{ fontSize:"28px", marginBottom:"12px" }}>✉️</div>
                <p style={{
                  fontFamily:"'Cormorant Garamond',serif",
                  fontSize:"clamp(18px,4vw,21px)", fontStyle:"italic",
                  color:"#4a3728", lineHeight:1.65, margin:0,
                }}>{message}</p>
                <p style={{
                  fontFamily:"'Inter',sans-serif", fontSize:"13px",
                  color:"#a89070", marginTop:"10px", letterSpacing:"0.04em",
                }}>We&apos;ll be in touch when we launch.</p>
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
                      width:"100%", minHeight:"56px",
                      padding:"0 22px",
                      borderRadius:"14px",
                      border:"1px solid rgba(139,94,60,0.22)",
                      background:"rgba(255,255,255,0.75)",
                      color:"#3a2616",
                      fontSize:"16px",
                      fontFamily:"'Inter',sans-serif",
                      transition:"border-color .2s, background .2s",
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "rgba(139,94,60,0.55)";
                      e.target.style.background = "#fff";
                      e.target.style.boxShadow = "0 0 0 3px rgba(139,94,60,0.1)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "rgba(139,94,60,0.22)";
                      e.target.style.background = "rgba(255,255,255,0.75)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <button type="submit" disabled={status === "loading"} className="cta-btn"
                    style={{ opacity: status === "loading" ? .6 : 1 }}>
                    {status === "loading" ? "Joining…" : "Notify Me When We Launch"}
                  </button>
                </form>
                {status === "error" && (
                  <p style={{ color:"#c0392b", fontSize:"13px", fontFamily:"'Inter',sans-serif", textAlign:"center" }}>
                    {message}
                  </p>
                )}
                <p style={{
                  marginTop:"4px", fontSize:"11px",
                  color:"rgba(139,94,60,0.45)",
                  fontFamily:"'Inter',sans-serif",
                  letterSpacing:"0.07em", textTransform:"uppercase",
                }}>
                  No spam, ever &nbsp;·&nbsp; Just our launch announcement
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Bottom accent line */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:1 }}>
          <p style={{
            textAlign:"center", padding:"14px",
            fontSize:"10px", color:"rgba(139,94,60,0.3)",
            fontFamily:"'Inter',sans-serif",
            letterSpacing:"0.08em", textTransform:"uppercase",
          }}>
            © {new Date().getFullYear()} Artisans&apos; Stories · El Salvador
          </p>
          <div style={{ height:"3px", background:"linear-gradient(90deg,transparent,#8b5e3c,#c8956c,#8b5e3c,transparent)" }}/>
        </div>

      </main>
    </>
  );
}
