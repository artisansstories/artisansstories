"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "This link is invalid or has expired. Request a new one.",
  expired: "This link has expired. Request a new one.",
  used: "This link has already been used. Request a new one.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (errorParam && ERROR_MESSAGES[errorParam]) {
      setStatus("error");
      setErrorMessage(ERROR_MESSAGES[errorParam]);
    }
  }, [errorParam]);

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

      if (res.ok || res.status === 429) {
        if (res.status === 429) {
          setErrorMessage("Too many requests. Please wait a few minutes and try again.");
          setStatus("error");
        } else {
          setSubmittedEmail(email.trim());
          setStatus("success");
        }
      } else {
        setErrorMessage("Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

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

  if (status === "success") {
    return (
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "#fff",
        borderRadius: 20,
        padding: "clamp(32px,6vw,48px) clamp(24px,5vw,40px)",
        boxShadow: "0 4px 48px rgba(139,105,20,0.10), 0 1px 0 rgba(255,255,255,0.8) inset",
        border: "1px solid rgba(200,180,140,0.25)",
        textAlign: "center",
      }}>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #f0faf0, #e8f5e8)",
          border: "1.5px solid rgba(80,160,80,0.2)",
          margin: "0 auto 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4a9a4a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "clamp(20px,4vw,24px)",
          fontWeight: 500,
          color: "#3a2e24",
          marginBottom: 10,
        }}>
          Check your email
        </h2>

        <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter',sans-serif", lineHeight: 1.6, marginBottom: 6 }}>
          We sent a magic link to
        </p>
        <p style={{ fontSize: 15, color: "#3a2e24", fontFamily: "'Inter',sans-serif", fontWeight: 600, marginBottom: 16 }}>
          {submittedEmail}
        </p>
        <p style={{ fontSize: 13, color: "#b09878", fontFamily: "'Inter',sans-serif", lineHeight: 1.6 }}>
          It expires in 15 minutes. Only authorized admin emails can receive access links.
        </p>

        <button
          onClick={() => { setStatus("idle"); setEmail(""); }}
          style={{
            marginTop: 24,
            background: "transparent",
            border: "none",
            fontSize: 13,
            color: "#8B6914",
            fontFamily: "'Inter',sans-serif",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Use a different email
        </button>
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
          alt="Artisans Stories"
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
        Artisans Stories management
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

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.04em", marginBottom: 6, textTransform: "uppercase" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@artisansstories.com"
            required
            autoComplete="email"
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
          {status === "loading" ? "Sending…" : "Send Magic Link"}
        </button>
      </form>

      <p style={{ fontSize: 12, color: "#b09878", textAlign: "center", fontFamily: "'Inter',sans-serif", marginTop: 20, lineHeight: 1.6 }}>
        Only authorized admin emails can receive access links.
      </p>

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
