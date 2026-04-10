"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

const inputStyle = {
  width: "100%",
  height: 48,
  padding: "0 16px",
  borderRadius: 10,
  border: "1.5px solid #e0d5c5",
  background: "#fdfaf6",
  fontSize: 15,
  color: "#3a2e24",
  fontFamily: "'Inter',sans-serif",
  transition: "border-color 0.15s",
  outline: "none",
};

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `(${digits.slice(-10, -7) || "***"}) ***-${digits.slice(-4)}`;
  }
  return phone;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (errorParam === "unauthorized") {
      setStatus("error");
      setErrorMessage("Session expired. Please sign in again.");
    }
  }, [errorParam]);

  function startResendTimer() {
    setResendCountdown(30);
    countdownRef.current = setInterval(() => {
      setResendCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/admin/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      if (res.status === 429) {
        setErrorMessage("Too many requests. Please wait a few minutes and try again.");
        setStatus("error");
      } else if (res.ok) {
        setStep("otp");
        setStatus("idle");
        startResendTimer();
      } else {
        setErrorMessage("Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/admin/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });

      if (res.ok) {
        window.location.href = "/admin";
      } else if (res.status === 429) {
        setErrorMessage("Too many attempts. Please wait and try again.");
        setStatus("error");
      } else {
        setErrorMessage("Invalid or expired code. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  async function handleResend() {
    if (resendCountdown > 0) return;
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/auth/admin/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (res.status === 429) {
        setErrorMessage("Too many requests. Please wait a few minutes.");
        setStatus("error");
      } else {
        setStatus("idle");
        startResendTimer();
      }
    } catch {
      setErrorMessage("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div style={{
      width: "100%",
      maxWidth: 400,
      background: "#fff",
      borderRadius: 20,
      padding: "clamp(32px,6vw,48px) clamp(24px,5vw,40px)",
      boxShadow: "0 4px 48px rgba(139,105,20,0.10), 0 1px 0 rgba(255,255,255,0.8) inset",
      border: "1px solid rgba(200,180,140,0.25)",
    }}>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <Image
          src="/logo-color.png"
          alt="Artisans' Stories"
          width={280}
          height={75}
          style={{ width: "min(200px, 70%)", height: "auto", display: "inline-block" }}
          unoptimized
          priority
        />
      </div>

      {/* Divider */}
      <div style={{ width: 48, height: 1, background: "linear-gradient(90deg,transparent,#c8a84c,transparent)", margin: "0 auto 28px" }} />

      {/* Heading */}
      <h1 style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: "clamp(22px,4vw,26px)",
        fontWeight: 400,
        color: "#3a2e24",
        textAlign: "center",
        marginBottom: 8,
      }}>
        Admin Sign In
      </h1>
      <p style={{ fontSize: 13, color: "#9a876e", textAlign: "center", fontFamily: "'Inter',sans-serif", marginBottom: 28 }}>
        {step === "phone" ? "Artisans' Stories management" : `Code sent to ${maskPhone(phone)}`}
      </p>

      {status === "error" && errorMessage && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 8,
          background: "#fff5f5",
          border: "1px solid rgba(220,80,60,0.2)",
          color: "#c0392b",
          fontSize: 13,
          fontFamily: "'Inter',sans-serif",
          marginBottom: 16,
          lineHeight: 1.5,
        }}>
          {errorMessage}
        </div>
      )}

      {step === "phone" ? (
        <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.04em", marginBottom: 6, textTransform: "uppercase" }}>
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(925) 980-6387"
              required
              autoComplete="tel"
              autoFocus
              disabled={status === "loading"}
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
              onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
            />
          </div>

          <button
            type="submit"
            disabled={status === "loading"}
            style={{
              width: "100%",
              height: 50,
              borderRadius: 12,
              border: "none",
              background: status === "loading"
                ? "#c8a84c"
                : "linear-gradient(135deg, #8B6914 0%, #c8a84c 100%)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: "'Inter',sans-serif",
              cursor: status === "loading" ? "not-allowed" : "pointer",
              opacity: status === "loading" ? 0.75 : 1,
              transition: "opacity 0.15s, transform 0.1s",
              marginTop: 6,
              boxShadow: "0 4px 16px rgba(139,105,20,0.25)",
            }}
          >
            {status === "loading" ? "Sending…" : "Send Code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.04em", marginBottom: 6, textTransform: "uppercase" }}>
              6-Digit Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              required
              autoFocus
              disabled={status === "loading"}
              style={{
                ...inputStyle,
                fontSize: 28,
                letterSpacing: "0.3em",
                textAlign: "center",
                fontWeight: 600,
              }}
              onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
              onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
            />
          </div>

          <button
            type="submit"
            disabled={status === "loading"}
            style={{
              width: "100%",
              height: 50,
              borderRadius: 12,
              border: "none",
              background: status === "loading"
                ? "#c8a84c"
                : "linear-gradient(135deg, #8B6914 0%, #c8a84c 100%)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: "'Inter',sans-serif",
              cursor: status === "loading" ? "not-allowed" : "pointer",
              opacity: status === "loading" ? 0.75 : 1,
              transition: "opacity 0.15s",
              marginTop: 6,
              boxShadow: "0 4px 16px rgba(139,105,20,0.25)",
            }}
          >
            {status === "loading" ? "Verifying…" : "Sign In"}
          </button>

          <div style={{ textAlign: "center", marginTop: 4 }}>
            {resendCountdown > 0 ? (
              <span style={{ fontSize: 13, color: "#b09878", fontFamily: "'Inter',sans-serif" }}>
                Resend code in {resendCountdown}s
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={status === "loading"}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 13,
                  color: "#8B6914",
                  fontFamily: "'Inter',sans-serif",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Resend code
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => { setStep("phone"); setCode(""); setStatus("idle"); setErrorMessage(""); }}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 13,
              color: "#b09878",
              fontFamily: "'Inter',sans-serif",
              cursor: "pointer",
              textAlign: "center",
              marginTop: -4,
            }}
          >
            ← Use a different number
          </button>
        </form>
      )}

      {step === "phone" && (
        <p style={{ fontSize: 12, color: "#b09878", textAlign: "center", fontFamily: "'Inter',sans-serif", marginTop: 20, lineHeight: 1.6 }}>
          Only authorized phone numbers can receive access codes.
        </p>
      )}
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; }
        body { font-family: 'Inter', sans-serif; }
        input { -webkit-appearance: none; appearance: none; }
        input:focus { outline: none; }
      `}</style>

      <main style={{
        minHeight: "100dvh",
        background: "linear-gradient(160deg, #fdf8f1 0%, #f5ede0 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(24px,5vw,48px) 20px",
      }}>
        <Suspense fallback={<div />}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
