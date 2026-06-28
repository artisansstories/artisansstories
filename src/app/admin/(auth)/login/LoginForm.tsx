"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

/**
 * Branding for the admin login screen. `null` = the apex (Artisans' Stories) —
 * the house default. When the admin signs in on a tenant subdomain the server
 * resolves that tenant and passes its name / logo / primary color here so the
 * login wears the store's brand (T4).
 */
export interface LoginBrand {
  tenantName: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

function errorText(code: string | null): string {
  switch (code) {
    case "unauthorized": return "Access denied. This admin is restricted to authorized accounts.";
    case "expired": return "Link expired. Please request a new one.";
    case "used": return "Link already used. Please request a new one.";
    case "invalid": return "Invalid link. Please request a new one.";
    default: return "";
  }
}

function LoginCard({ brand }: { brand: LoginBrand | null }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState(errorText(error));

  // The button uses the tenant's primary color when branded, else the house gold.
  const buttonBackground =
    status === "loading"
      ? brand?.primaryColor ?? "#c8a84c"
      : brand?.primaryColor
        ? `linear-gradient(135deg, ${brand.primaryColor} 0%, ${brand.primaryColor} 100%)`
        : "linear-gradient(135deg, #8B6914 0%, #c8a84c 100%)";

  const adminTitle = brand ? `${brand.tenantName} Admin` : "Admin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMessage("");

    try {
      // Relative URL → posts to the CURRENT host, so the verify token (and the
      // resulting host-scoped session) is tied to this exact subdomain (T4).
      const res = await fetch("/api/auth/admin/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), callbackUrl }),
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
          If <strong>{email}</strong> is authorized for {brand ? brand.tenantName : "this admin"}, a sign-in link is on its way. It expires in 15 minutes.
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
      {/* Logo — the tenant's when branded, else the Artisans' Stories mark. */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        {brand?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.tenantName}
            style={{ maxWidth: "min(200px, 70%)", maxHeight: 75, height: "auto", width: "auto", display: "inline-block", objectFit: "contain" }}
          />
        ) : (
          <Image
            src="/logo-color.png"
            alt="Artisans' Stories"
            width={280}
            height={75}
            style={{ width: "min(200px, 70%)", height: "auto", display: "inline-block" }}
            unoptimized
            priority
          />
        )}
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
        Sign In to {adminTitle}
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
            placeholder="you@example.com"
            disabled={status === "loading"}
            style={{
              width: "100%", height: 48, padding: "0 16px", borderRadius: 10,
              border: "1.5px solid #e0d5c5", background: "#fdfaf6",
              fontSize: 15, color: "#3a2e24", fontFamily: "'Inter',sans-serif",
              outline: "none", transition: "border-color 0.15s",
            }}
            onFocus={e => { e.target.style.borderColor = brand?.primaryColor ?? "#8B6914"; }}
            onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          style={{
            width: "100%", height: 50, borderRadius: 12, border: "none",
            background: buttonBackground,
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

export default function LoginForm({ brand }: { brand: LoginBrand | null }) {
  return (
    <Suspense fallback={<div />}>
      <LoginCard brand={brand} />
    </Suspense>
  );
}
