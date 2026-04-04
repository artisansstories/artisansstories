"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";

const FOOTER_LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/shipping-policy", label: "Shipping Policy" },
  { href: "/returns-policy", label: "Returns Policy" },
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

const INSTAGRAM_URL = "https://www.instagram.com/artisansstories";
const TIKTOK_URL = "https://www.tiktok.com/@artisansstories";

function IconInstagram({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function IconTikTok({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.41a8.16 8.16 0 0 0 4.77 1.52V7.49a4.85 4.85 0 0 1-1.01-.8z" />
    </svg>
  );
}

export default function ShopFooter() {
  return (
    <footer style={{ background: "#3a2e24", color: "#e8dcc8", marginTop: "auto" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px 32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 32, marginBottom: 40 }}>
          <div>
            <Image src="/logo-color.png" alt="Artisans' Stories" width={140} height={38}
              style={{ width: 130, height: "auto", filter: "brightness(0) invert(1) sepia(1) saturate(0.5) brightness(1.2)", marginBottom: 12 }}
              unoptimized
            />
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: "#c9b99a", margin: 0, fontStyle: "italic" }}>
              Handcrafted with love from El Salvador
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
            {FOOTER_LINKS.map(link => (
              <Link key={link.href} href={link.href}
                style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#c9b99a", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#C9A84C"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#c9b99a"; }}
              >{link.label}</Link>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            {[
              { href: INSTAGRAM_URL, icon: <IconInstagram size={18} />, label: "Instagram" },
              { href: TIKTOK_URL, icon: <IconTikTok size={18} />, label: "TikTok" },
            ].map(({ href, icon, label }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid rgba(201,184,154,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#c9b99a", textDecoration: "none", transition: "border-color 0.15s, color 0.15s, background 0.15s" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#C9A84C"; el.style.color = "#C9A84C"; el.style.background = "rgba(201,168,76,0.1)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(201,184,154,0.3)"; el.style.color = "#c9b99a"; el.style.background = "transparent"; }}
                aria-label={label}
              >
                {icon}
              </a>
            ))}
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(201,184,154,0.2)", paddingTop: 20 }}>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#8a7060", margin: 0, textAlign: "center" }}>
            © 2026 Artisans' Stories. Handcrafted in El Salvador.
          </p>
        </div>
      </div>
    </footer>
  );
}
