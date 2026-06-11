"use client";

import { useState, useEffect, useRef } from "react";

export default function AccountNav({ hasSession }: { hasSession: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!hasSession) {
    return (
      <a
        href="/account/login"
        style={{
          padding: "10px 20px",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 500,
          color: "#fff",
          background: "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)",
          fontFamily: "'Inter', sans-serif",
          boxShadow: "0 2px 8px rgba(139,105,20,0.25)",
          whiteSpace: "nowrap",
        }}
      >
        Sign In
      </a>
    );
  }

  const navLinks = [
    { href: "/account/orders", label: "Orders" },
    { href: "/account/addresses", label: "Addresses" },
    { href: "/account/profile", label: "Profile" },
  ];

  return (
    <>
      {/* ── Desktop nav (≥640px) ── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 4 }}
        className="account-nav-desktop"
      >
        {navLinks.map((l) => (
          <a
            key={l.href}
            href={l.href}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              color: "#5a4a38",
              fontFamily: "'Inter', sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {l.label}
          </a>
        ))}
        <a
          href="/api/auth/customer/logout"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: "#8B6914",
            fontFamily: "'Inter', sans-serif",
            border: "1px solid rgba(139,105,20,0.3)",
            whiteSpace: "nowrap",
          }}
        >
          Sign Out
        </a>
      </div>

      {/* ── Mobile hamburger (< 640px) ── */}
      <div
        ref={menuRef}
        style={{ position: "relative" }}
        className="account-nav-mobile"
      >
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
          style={{
            width: 44,
            height: 44,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: 8,
            borderRadius: 8,
          }}
        >
          {/* Hamburger icon → X when open */}
          <span
            style={{
              display: "block",
              width: 22,
              height: 2,
              background: "#5a4a38",
              borderRadius: 2,
              transition: "transform 0.2s, opacity 0.2s",
              transform: open ? "rotate(45deg) translate(5px, 5px)" : "none",
            }}
          />
          <span
            style={{
              display: "block",
              width: 22,
              height: 2,
              background: "#5a4a38",
              borderRadius: 2,
              transition: "opacity 0.2s",
              opacity: open ? 0 : 1,
            }}
          />
          <span
            style={{
              display: "block",
              width: 22,
              height: 2,
              background: "#5a4a38",
              borderRadius: 2,
              transition: "transform 0.2s, opacity 0.2s",
              transform: open ? "rotate(-45deg) translate(5px, -5px)" : "none",
            }}
          />
        </button>

        {/* Dropdown */}
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              background: "#fff",
              border: "1px solid #ede8df",
              borderRadius: 14,
              boxShadow: "0 8px 32px rgba(58,46,36,0.12)",
              minWidth: 180,
              overflow: "hidden",
              zIndex: 100,
            }}
          >
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "14px 20px",
                  fontSize: 15,
                  fontWeight: 500,
                  color: "#3a2e24",
                  fontFamily: "'Inter', sans-serif",
                  borderBottom: "1px solid #f0ece4",
                  textDecoration: "none",
                }}
              >
                {l.label}
              </a>
            ))}
            <a
              href="/api/auth/customer/logout"
              style={{
                display: "block",
                padding: "14px 20px",
                fontSize: 15,
                fontWeight: 500,
                color: "#8B6914",
                fontFamily: "'Inter', sans-serif",
                textDecoration: "none",
              }}
            >
              Sign Out
            </a>
          </div>
        )}
      </div>

      {/* Responsive CSS */}
      <style>{`
        .account-nav-desktop { display: flex !important; }
        .account-nav-mobile  { display: none  !important; }

        @media (max-width: 639px) {
          .account-nav-desktop { display: none  !important; }
          .account-nav-mobile  { display: block !important; }
        }
      `}</style>
    </>
  );
}
