"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (errorParam === "invalid") {
      setStatus("error");
      setErrorMessage("Invalid or expired link. Please try again.");
    }
  }, [errorParam]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/customer/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (res.ok) {
        setSubmittedEmail(email.trim());
        setStatus("success");
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "#fff",
        borderRadius: 20,
        padding: "clamp(32px,6vw,48px) clamp(24px,5vw,40px)",
        boxShadow: "0 4px 48px rgba(139,105,20,0.10)",
        border: "1px solid rgba(200,180,140,0.25)",
        textAlign: "center",
      }}>
        {/* Checkmark */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #f0faf0, #e8f5e8)",
          border: "1.5px solid rgba(80,160,80,0.2)",
          margin: "0 auto 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a9a4a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "clamp(22px,4vw,26px)",
          fontWeight: 500,
          color: "#3a2e24",
          marginBottom: 10,
        }}>
          Check your email!
        </h2>

        <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter',sans-serif", lineHeight: 1.6, marginBottom: 8 }}>
          We sent a sign-in link to
        </p>
        <p style={{ fontSize: 15, color: "#3a2e24", fontFamily: "'Inter',sans-serif", fontWeight: 600, marginBottom: 16 }}>
          {submittedEmail}
        </p>
        <p style={{ fontSize: 13, color: "#b09878", fontFamily: "'Inter',sans-serif", lineHeight: 1.6 }}>
          It expires in 15 minutes. Check your spam folder if you don&apos;t see it.
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
      maxWidth: 420,
      background: "#fff",
      borderRadius: 20,
      padding: "clamp(32px,6vw,48px) clamp(24px,5vw,40px)",
      boxShadow: "0 4px 48px rgba(139,105,20,0.10)",
      border: "1px solid rgba(200,180,140,0.25)",
    }}>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <a href="/">
          <Image
            src="/logo-color.png"
            alt="Artisans' Stories"
            width={280}
            height={75}
            style={{ width: "min(200px, 70%)", height: "auto", display: "inline-block" }}
            unoptimized
            priority
          />
        </a>
      </div>

      {/* Decorative divider */}
      <div style={{ width: 48, height: 1, background: "linear-gradient(90deg,transparent,#c8a84c,transparent)", margin: "0 auto 24px" }} />

      <h1 style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: "clamp(22px,4vw,26px)",
        fontWeight: 400,
        color: "#3a2e24",
        textAlign: "center",
        marginBottom: 6,
      }}>
        Sign in to your account
      </h1>
      <p style={{ fontSize: 13, color: "#9a876e", textAlign: "center", fontFamily: "'Inter',sans-serif", marginBottom: 28 }}>
        We&apos;ll send a magic link to your email
      </p>

      {status === "error" && errorMessage && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 10,
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

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            color: "#6b5540",
            fontFamily: "'Inter',sans-serif",
            letterSpacing: "0.06em",
            marginBottom: 7,
            textTransform: "uppercase",
          }}>
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            autoFocus
            disabled={status === "loading"}
            style={{
              width: "100%",
              height: 56,
              padding: "0 18px",
              borderRadius: 12,
              border: "1.5px solid #e0d5c5",
              background: "#fdfaf6",
              fontSize: 16,
              color: "#3a2e24",
              fontFamily: "'Inter',sans-serif",
              transition: "border-color 0.15s",
              outline: "none",
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
            height: 56,
            borderRadius: 12,
            border: "none",
            background: status === "loading"
              ? "#c8a84c"
              : "linear-gradient(135deg, #8B6914 0%, #c8a84c 100%)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "0.04em",
            fontFamily: "'Inter',sans-serif",
            cursor: status === "loading" ? "not-allowed" : "pointer",
            opacity: status === "loading" ? 0.8 : 1,
            transition: "opacity 0.15s, transform 0.1s",
            boxShadow: "0 4px 16px rgba(139,105,20,0.25)",
          }}
        >
          {status === "loading" ? "Sending…" : "Send Magic Link"}
        </button>
      </form>

      <p style={{ fontSize: 12, color: "#b09878", textAlign: "center", fontFamily: "'Inter',sans-serif", marginTop: 20, lineHeight: 1.6 }}>
        No password needed. We&apos;ll email you a secure sign-in link.
      </p>

    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <main style={{
        minHeight: "calc(100dvh - 130px)",
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
