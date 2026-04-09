"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export default function LandingPage() {
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

        input[type="email"] { -webkit-appearance:none; appearance:none; }
        input::placeholder { color:rgba(255,255,255,0.38); }
        input:focus { outline:none; }

        .cta-btn {
          width:100%; min-height:56px;
          border-radius:14px;
          border:1px solid rgba(210,165,90,0.4);
          background:linear-gradient(135deg,rgba(139,94,60,0.9),rgba(180,125,65,0.9));
          backdrop-filter:blur(12px);
          -webkit-backdrop-filter:blur(12px);
          color:#fff;
          font-size:13px; font-weight:500;
          letter-spacing:0.18em; text-transform:uppercase;
          font-family:'Inter',sans-serif;
          cursor:pointer;
          transition:opacity .2s, transform .15s;
          box-shadow:0 6px 28px rgba(0,0,0,0.3);
          -webkit-tap-highlight-color:transparent;
        }
        .cta-btn:active { transform:scale(0.98); opacity:.9; }
        .cta-btn:hover  { opacity:.88; transform:translateY(-1px); }

        .social-icon {
          display:flex; align-items:center; justify-content:center;
          width:48px; height:48px; border-radius:50%;
          background:rgba(255,255,255,0.1);
          border:1px solid rgba(255,255,255,0.2);
          color:rgba(255,255,255,0.75);
          transition:background .2s, color .2s;
          text-decoration:none;
          -webkit-tap-highlight-color:transparent;
          backdrop-filter:blur(8px);
          -webkit-backdrop-filter:blur(8px);
        }
        .social-icon:hover {
          background:rgba(255,255,255,0.18);
          color:#fff;
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
      }}>

        {/* Background image */}
        <div style={{ position:"absolute", inset:0, zIndex:0 }}>
          <Image
            src="/hero.png"
            alt="Artisans at work"
            fill
            style={{ objectFit:"cover", objectPosition:"center center" }}
            priority
            unoptimized
          />
          {/* Dark overlay — heavier overall for better text contrast */}
          <div style={{
            position:"absolute", inset:0,
            background:"linear-gradient(to bottom, rgba(10,6,3,0.88) 0%, rgba(10,6,3,0.68) 25%, rgba(10,6,3,0.65) 70%, rgba(10,6,3,0.90) 100%)",
          }}/>
          {/* Warm center glow to complement the earthy image */}
          <div style={{
            position:"absolute", inset:0,
            background:"radial-gradient(ellipse 70% 55% at 50% 48%, rgba(160,100,40,0.18) 0%, transparent 65%)",
          }}/>
        </div>

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
            background:"rgba(255,255,255,0.08)",
            border:"1px solid rgba(255,255,255,0.16)",
            backdropFilter:"blur(12px)",
            WebkitBackdropFilter:"blur(12px)",
            borderRadius:"100px",
            padding:"10px 22px",
            marginBottom:"clamp(36px,6vw,48px)",
          }}>
            <div style={{
              borderRadius:"12px",
              background:"#d4956a", flexShrink:0,
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

          {/* Logo — frosted white card for contrast against busy background */}
          <div className="a2" style={{
            marginBottom:"clamp(28px,5vw,40px)",
            padding:"clamp(16px,3vw,24px) clamp(24px,5vw,44px)",
            background:"rgba(255,255,255,0.88)",
            backdropFilter:"blur(20px)",
            WebkitBackdropFilter:"blur(20px)",
            borderRadius:"18px",
            boxShadow:"0 4px 32px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.6) inset",
          }}>
            <Image
              src="/logo-color.png"
              alt="Artisans' Stories"
              width={1748}
              height={470}
              style={{
                width:"min(82vw,460px)",
                height:"auto",
                display:"block",
              }}
              priority
              unoptimized
            />
          </div>

          {/* Anna's portrait with intro */}
          <div className="a2" style={{
            position:"relative",
            marginBottom:"clamp(24px,5vw,36px)",
          }}>
            <div style={{
              width:"clamp(280px,45vw,420px)",
              height:"clamp(280px,45vw,420px)",
              borderRadius:"12px",
              padding:"5px",
              background:"linear-gradient(135deg, #d4956a 0%, #b87d41 50%, #d4956a 100%)",
              boxShadow:"0 8px 32px rgba(212,149,106,0.4), 0 0 60px rgba(212,149,106,0.2)",
              margin:"0 auto",
            }}>
              <div style={{
                width:"100%",
                height:"100%",
                overflow:"hidden",
                border:"4px solid rgba(255,255,255,0.95)",
                borderRadius:"8px",
              }}>
                <Image
                  src="/anna-profile.png"
                  alt="Anna Kool"
                  width={1729}
                  height={1729}
                  style={{
                    width:"100%",
                    height:"100%",
                    objectFit:"cover",
                  }}
                  unoptimized
                />
              </div>
            </div>
          </div>

          {/* Meet Anna text */}
          <div className="a3" style={{
            textAlign:"center",
            maxWidth:"580px",
            marginBottom:"clamp(32px,6vw,44px)",
          }}>
            <p style={{
              fontFamily:"'Inter',sans-serif",
              fontSize:"clamp(10px,2vw,11px)",
              fontWeight:600,
              letterSpacing:"0.2em",
              textTransform:"uppercase",
              color:"rgba(212,149,106,0.9)",
              marginBottom:"10px",
            }}>Meet Anna</p>
            
            <p style={{
              fontFamily:"'Cormorant Garamond',Georgia,serif",
              fontSize:"clamp(16px,3vw,19px)",
              fontWeight:300,
              color:"rgba(255,255,255,0.88)",
              lineHeight:1.75,
              marginBottom:"14px",
            }}>
              I'm Anna, the founder of Artisans' Stories. I started this business with a "random spark" and a big mission: to build a bridge between the deep roots of my home in El Salvador and the modern craft I create here in the United States.
            </p>
            
            <p style={{
              fontFamily:"'Cormorant Garamond',Georgia,serif",
              fontSize:"clamp(15px,2.8vw,17px)",
              fontWeight:300,
              color:"rgba(255,255,255,0.68)",
              lineHeight:1.75,
            }}>
              Every artisan has a story. Every craft holds generations of tradition. I'm here to bring those stories—and those beautiful handmade pieces—directly to you.
            </p>
          </div>

          {/* Divider */}
          <div className="a3" style={{
            width:"56px", height:"1px",
            background:"linear-gradient(90deg,transparent,rgba(210,170,100,0.8),transparent)",
            marginBottom:"clamp(28px,5vw,40px)",
          }}/>


          {/* Headline */}
          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(21px,4vw,26px)",
            fontWeight:300, fontStyle:"italic",
            color:"rgba(255,255,255,0.93)", lineHeight:1.7,
            marginBottom:"clamp(14px,3vw,20px)",
            maxWidth:"520px",
          }}>
            Be among the first to join and be part of the journey.
          </p>

          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(17px,3vw,20px)",
            fontWeight:300, color:"rgba(255,255,255,0.68)", lineHeight:1.9,
            marginBottom:"clamp(10px,2vw,14px)",
            maxWidth:"500px",
          }}>
            We&apos;re putting the finishing touches on something special&nbsp;&mdash;&nbsp;handcrafted goods from El Salvador&apos;s most talented artisans.
          </p>

          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(17px,3vw,20px)",
            fontWeight:300, color:"rgba(255,255,255,0.5)", lineHeight:1.9,
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
            <a href="https://www.instagram.com/artisansstories?igsh=NTc4MTIwNjQ2YQ==" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="social-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <circle cx="12" cy="12" r="4.5"/>
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </a>
            <a href="https://www.tiktok.com/@artisansstories" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="social-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
              </svg>
            </a>
          </div>

          {/* Email form */}
          <div className="a5" style={{ width:"100%", maxWidth:"460px" }}>
            {status === "success" ? (
              <div style={{
                background:"rgba(255,255,255,0.08)",
                border:"1px solid rgba(255,255,255,0.15)",
                backdropFilter:"blur(16px)",
                WebkitBackdropFilter:"blur(16px)",
                borderRadius:"16px",
                padding:"clamp(24px,5vw,36px)",
                textAlign:"center",
              }}>
                <div style={{ fontSize:"28px", marginBottom:"12px" }}>✉️</div>
                <p style={{
                  fontFamily:"'Cormorant Garamond',serif",
                  fontSize:"clamp(18px,4vw,21px)", fontStyle:"italic",
                  color:"rgba(255,255,255,0.9)", lineHeight:1.65, margin:0,
                }}>{message}</p>
                <p style={{
                  fontFamily:"'Inter',sans-serif", fontSize:"13px",
                  color:"rgba(255,255,255,0.4)", marginTop:"10px", letterSpacing:"0.04em",
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
                      border:"1px solid rgba(255,255,255,0.18)",
                      background:"rgba(255,255,255,0.09)",
                      backdropFilter:"blur(16px)",
                      WebkitBackdropFilter:"blur(16px)",
                      color:"#fff",
                      fontSize:"16px",
                      fontFamily:"'Inter',sans-serif",
                      transition:"border-color .2s, background .2s",
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "rgba(212,149,106,0.65)";
                      e.target.style.background = "rgba(255,255,255,0.13)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "rgba(255,255,255,0.18)";
                      e.target.style.background = "rgba(255,255,255,0.09)";
                    }}
                  />
                  <button type="submit" disabled={status === "loading"} className="cta-btn"
                    style={{ opacity: status === "loading" ? .6 : 1 }}>
                    {status === "loading" ? "Joining…" : "Notify Me When We Launch"}
                  </button>
                </form>
                {status === "error" && (
                  <p style={{ color:"#ffb09c", fontSize:"13px", fontFamily:"'Inter',sans-serif", textAlign:"center" }}>
                    {message}
                  </p>
                )}
                <p style={{
                  marginTop:"4px", fontSize:"11px",
                  color:"rgba(255,255,255,0.28)",
                  fontFamily:"'Inter',sans-serif",
                  letterSpacing:"0.07em", textTransform:"uppercase",
                }}>
                  No spam, ever &nbsp;·&nbsp; Just our launch announcement
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{
          position:"absolute", bottom:0, left:0, right:0,
          padding:"16px 24px",
          paddingBottom:"max(16px, env(safe-area-inset-bottom))",
          textAlign:"center", zIndex:1,
        }}>
          <p style={{
            fontSize:"10px", color:"rgba(255,255,255,0.18)",
            fontFamily:"'Inter',sans-serif",
            letterSpacing:"0.08em", textTransform:"uppercase",
          }}>
            © {new Date().getFullYear()} Artisans&apos; Stories · El Salvador
          </p>
        </div>

      </main>
    </>
  );
}
