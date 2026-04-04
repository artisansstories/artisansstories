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
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:.45; transform:scale(.82); }
        }

        .a1 { animation: fadeUp .9s ease-out .05s both; }
        .a2 { animation: fadeUp .9s ease-out .25s both; }
        .a3 { animation: fadeUp .9s ease-out .45s both; }
        .a4 { animation: fadeUp .9s ease-out .65s both; }
        .a5 { animation: fadeUp .9s ease-out .85s both; }
        .abg{ animation: fadeIn 1.6s ease-out both; }

        input::placeholder { color: rgba(255,255,255,0.4); }
        input:focus { outline: none; }
        button { cursor: pointer; }
        button:hover { opacity:.92; transform:translateY(-1px) !important; }
        button:active { transform:translateY(0) !important; }
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

        {/* Background */}
        <div className="abg" style={{ position:"absolute", inset:0, zIndex:0 }}>
          <Image
            src="/hero.jpg"
            alt="background"
            fill
            style={{ objectFit:"cover", objectPosition:"center center" }}
            priority
            unoptimized
          />
          {/* Dark overlay — heavier at top/bottom, lighter in center */}
          <div style={{
            position:"absolute", inset:0,
            background:"linear-gradient(to bottom, rgba(8,10,18,0.72) 0%, rgba(8,10,18,0.45) 30%, rgba(8,10,18,0.45) 70%, rgba(8,10,18,0.78) 100%)",
          }}/>
          {/* Warm center radial to give depth */}
          <div style={{
            position:"absolute", inset:0,
            background:"radial-gradient(ellipse 70% 60% at 50% 50%, rgba(180,130,80,0.12) 0%, transparent 70%)",
          }}/>
        </div>

        {/* ── CONTENT ── */}
        <div style={{
          position:"relative", zIndex:1,
          display:"flex", flexDirection:"column", alignItems:"center",
          padding:"72px 32px",
          width:"100%", maxWidth:"760px",
          textAlign:"center",
          opacity: mounted ? 1 : 0,
          transition:"opacity .3s",
        }}>

          {/* Coming Soon badge */}
          <div className="a1" style={{
            display:"inline-flex", alignItems:"center", gap:"9px",
            background:"rgba(255,255,255,0.07)",
            border:"1px solid rgba(255,255,255,0.16)",
            backdropFilter:"blur(14px)",
            borderRadius:"100px",
            padding:"8px 24px",
            marginBottom:"52px",
          }}>
            <div style={{
              width:"7px", height:"7px", borderRadius:"50%",
              background:"#d4956a",
              animation:"pulse 2.5s ease-in-out infinite",
            }}/>
            <span style={{
              fontSize:"10.5px", fontWeight:"500",
              letterSpacing:"0.22em", textTransform:"uppercase",
              color:"rgba(255,255,255,0.82)",
              fontFamily:"'Inter',sans-serif",
            }}>Coming Soon</span>
          </div>

          {/* Logo — large, color, centered */}
          <div className="a2" style={{ marginBottom:"44px", width:"100%" }}>
            <Image
              src="/logo-color.png"
              alt="Artisans' Stories"
              width={560}
              height={187}
              style={{
                width:"min(560px, 88vw)",
                height:"auto",
                filter:"drop-shadow(0 4px 24px rgba(0,0,0,0.55))",
              }}
              priority
              unoptimized
            />
          </div>

          {/* Divider */}
          <div className="a2" style={{
            width:"72px", height:"1px",
            background:"linear-gradient(90deg,transparent,rgba(210,170,100,0.8),transparent)",
            marginBottom:"44px",
          }}/>

          {/* Hero copy — large, elegant, centered */}
          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(20px,3.5vw,26px)",
            fontWeight:300,
            fontStyle:"italic",
            color:"rgba(255,255,255,0.93)",
            lineHeight:1.75,
            letterSpacing:"0.01em",
            marginBottom:"20px",
            maxWidth:"580px",
          }}>
            Be among the first to join and be part of the journey.
          </p>

          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(17px,2.8vw,21px)",
            fontWeight:300,
            color:"rgba(255,255,255,0.68)",
            lineHeight:1.9,
            marginBottom:"14px",
            maxWidth:"560px",
          }}>
            We&apos;re putting the finishing touches on something special&nbsp;&mdash;
            handcrafted goods from El Salvador&apos;s most talented artisans.
          </p>

          <p className="a3" style={{
            fontFamily:"'Cormorant Garamond',Georgia,serif",
            fontSize:"clamp(17px,2.8vw,21px)",
            fontWeight:300,
            color:"rgba(255,255,255,0.52)",
            lineHeight:1.9,
            marginBottom:"56px",
            maxWidth:"520px",
          }}>
            Every product has a story, and we are so excited to share
            those products and stories with you&hellip;
          </p>

          {/* Email form */}
          <div className="a4" style={{ width:"100%", maxWidth:"500px" }}>
            {status === "success" ? (
              <div style={{
                background:"rgba(255,255,255,0.07)",
                border:"1px solid rgba(255,255,255,0.15)",
                backdropFilter:"blur(16px)",
                borderRadius:"16px",
                padding:"32px 36px",
                textAlign:"center",
              }}>
                <div style={{ fontSize:"28px", marginBottom:"12px" }}>✉️</div>
                <p style={{
                  fontFamily:"'Cormorant Garamond',serif",
                  fontSize:"20px", fontStyle:"italic",
                  color:"rgba(255,255,255,0.9)", lineHeight:1.65, margin:0,
                }}>
                  {message}
                </p>
                <p style={{
                  fontFamily:"'Inter',sans-serif",
                  fontSize:"13px", color:"rgba(255,255,255,0.4)",
                  marginTop:"10px", letterSpacing:"0.04em",
                }}>
                  We&apos;ll be in touch when we launch.
                </p>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Your email address"
                    required
                    style={{
                      width:"100%",
                      padding:"18px 24px",
                      borderRadius:"14px",
                      border:"1px solid rgba(255,255,255,0.18)",
                      background:"rgba(255,255,255,0.08)",
                      backdropFilter:"blur(16px)",
                      color:"#fff",
                      fontSize:"16px",
                      fontFamily:"'Inter',sans-serif",
                      transition:"border-color .2s, background .2s",
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "rgba(212,149,106,0.65)";
                      e.target.style.background  = "rgba(255,255,255,0.12)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "rgba(255,255,255,0.18)";
                      e.target.style.background  = "rgba(255,255,255,0.08)";
                    }}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    style={{
                      width:"100%",
                      padding:"18px 24px",
                      borderRadius:"14px",
                      border:"1px solid rgba(210,165,90,0.45)",
                      background:"linear-gradient(135deg,rgba(150,100,50,0.82),rgba(190,130,65,0.82))",
                      backdropFilter:"blur(16px)",
                      color:"#fff",
                      fontSize:"12px", fontWeight:"500",
                      letterSpacing:"0.2em", textTransform:"uppercase",
                      fontFamily:"'Inter',sans-serif",
                      opacity: status === "loading" ? .65 : 1,
                      transition:"opacity .2s, transform .15s",
                      boxShadow:"0 8px 36px rgba(150,100,50,0.35)",
                    }}
                  >
                    {status === "loading" ? "Joining…" : "Notify Me When We Launch"}
                  </button>
                </form>

                {status === "error" && (
                  <p style={{
                    marginTop:"10px", color:"#ffb09c",
                    fontSize:"13px", fontFamily:"'Inter',sans-serif",
                  }}>{message}</p>
                )}

                <p className="a5" style={{
                  marginTop:"18px",
                  fontSize:"11px",
                  color:"rgba(255,255,255,0.28)",
                  fontFamily:"'Inter',sans-serif",
                  letterSpacing:"0.08em",
                  textTransform:"uppercase",
                }}>
                  No spam, ever &nbsp;·&nbsp; Just our launch announcement
                </p>
              </>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{
          position:"absolute", bottom:0, left:0, right:0,
          padding:"20px 24px", textAlign:"center", zIndex:1,
        }}>
          <p style={{
            fontSize:"11px",
            color:"rgba(255,255,255,0.18)",
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
