"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

function errorMessage(code: string | null): string {
  switch (code) {
    case "unauthorized": return "Access denied. This admin is restricted to authorized accounts only.";
    case "cancelled": return "Sign-in was cancelled. Please try again.";
    case "token_failed":
    case "userinfo_failed":
    case "server_error": return "Something went wrong. Please try again.";
    case "misconfigured": return "Server misconfiguration. Contact support.";
    default: return "";
  }
}

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const message = errorMessage(error);

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
        Artisans' Stories management
      </p>

      {message && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 8,
          background: "#fff5f5",
          border: "1px solid rgba(220,80,60,0.2)",
          color: "#c0392b",
          fontSize: 13,
          fontFamily: "'Inter',sans-serif",
          marginBottom: 20,
          lineHeight: 1.5,
        }}>
          {message}
        </div>
      )}

      {/* Google Sign In Button */}
      <a
        href="/api/auth/admin/google"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          width: "100%",
          height: 50,
          borderRadius: 12,
          border: "1.5px solid #e0d5c5",
          background: "#fff",
          color: "#3a2e24",
          fontSize: 15,
          fontWeight: 500,
          fontFamily: "'Inter',sans-serif",
          textDecoration: "none",
          cursor: "pointer",
          transition: "border-color 0.15s, box-shadow 0.15s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = "#8B6914";
          (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 2px 8px rgba(139,105,20,0.15)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = "#e0d5c5";
          (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
        }}
      >
        {/* Google Logo SVG */}
        <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          <path fill="none" d="M0 0h48v48H0z"/>
        </svg>
        Continue with Google
      </a>

      <p style={{ fontSize: 12, color: "#b5a48a", textAlign: "center", fontFamily: "'Inter',sans-serif", marginTop: 20, lineHeight: 1.6 }}>
        Access restricted to authorized accounts only.
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
