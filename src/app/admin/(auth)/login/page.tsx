"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

function errorText(code: string | null): string {
  switch (code) {
    case "unauthorized": return "Access denied. This admin is restricted to authorized accounts.";
    case "expired": return "Link expired. Please request a new one.";
    case "used": return "Link already used. Please request a new one.";
    case "invalid": return "Invalid link. Please request a new one.";
    default: return "";
  }
}

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState(errorText(error));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/admin/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (res.ok) {
        setStatus("sent");
      } else {
        setErrorMessage("Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMessage("Network error. Please check your connection.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "#fff",
        borderRadius: 20,
        padding: "clamp(32px,6vw,48px) clamp(24px,5vw,40px)",
        boxShadow: "0 4px 48px rgba(139,105,20,0.10)",
        border: "1px solid rgba(200,180,140,0.25)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
        <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 400, color: "#3a2e24", marginBottom: 12 }}>
          Check your email
        </h2>
        <p style={{ fontSize: 14, color: "#7a6852", lineHeight: 1.7, fontFamily: "'Inter',sans-serif" }}>
          If <strong>{email}</strong> is authorized, a sign-in link is on its way. It expires in 15 minutes.
        </p>
      </div>
    );
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

      <div style={{ width: 48, height: 1, background: "linear-gradient(90deg,transparent,#c8a84c,transparent)", margin: "0 auto 28px" }} />

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
        Enter your email to receive a sign-in link
      </p>

      {(status === "error" || error) && errorMessage && (
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

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{
            display: "block", fontSize: 12, fontWeight: 500, color: "#6b5540",
            fontFamily: "'Inter',sans-serif", letterSpacing: "0.04em", marginBottom: 6, textTransform: "uppercase",
          }}>
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            placeholder="you@artisansstories.com"
            disabled={status === "loading"}
            style={{
              width: "100%", height: 48, padding: "0 16px", borderRadius: 10,
              border: "1.5px solid #e0d5c5", background: "#fdfaf6",
              fontSize: 15, color: "#3a2e24", fontFamily: "'Inter',sans-serif",
              outline: "none", transition: "border-color 0.15s",
            }}
            onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
            onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          style={{
            width: "100%", height: 50, borderRadius: 12, border: "none",
            background: status === "loading"
              ? "#c8a84c"
              : "linear-gradient(135deg, #8B6914 0%, #c8a84c 100%)",
            color: "#fff", fontSize: 14, fontWeight: 500, letterSpacing: "0.08em",
            textTransform: "uppercase", fontFamily: "'Inter',sans-serif",
            cursor: status === "loading" ? "not-allowed" : "pointer",
            opacity: status === "loading" ? 0.75 : 1,
            marginTop: 6, boxShadow: "0 4px 16px rgba(139,105,20,0.25)",
          }}
        >
          {status === "loading" ? "Sending…" : "Send Sign-In Link"}
        </button>
      </form>
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
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "clamp(24px,5vw,48px) 20px",
      }}>
        <Suspense fallback={<div />}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
