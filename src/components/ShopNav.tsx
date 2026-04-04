"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/cart";
import { useCartDrawer } from "./CartDrawerProvider";

function IconCart({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconMenu({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function IconX({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

const NAV_LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function ShopNav() {
  const { openCart } = useCartDrawer();
  const items = useCart(state => state.items);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleScroll() { setScrolled(window.scrollY > 4); }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (mobileMenuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileMenuOpen]);

  return (
    <header style={{
      position: "sticky",
      top: 0,
      zIndex: 50,
      background: "#fff",
      borderBottom: scrolled ? "1px solid #ede8df" : "1px solid transparent",
      boxShadow: scrolled ? "0 2px 12px rgba(0,0,0,0.06)" : "none",
      transition: "border-color 0.2s, box-shadow 0.2s",
    }}>
      <div style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "0 20px",
        height: 68,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}>
        <Link href="/shop" style={{ textDecoration: "none", flexShrink: 0 }}>
          <Image src="/logo-color.png" alt="Artisans' Stories" width={160} height={43} style={{ width: 140, height: "auto" }} priority unoptimized />
        </Link>

        <nav style={{ display: "flex", gap: 4 }} className="shopnav-desktop">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 500, color: "#5a4a38", textDecoration: "none", padding: "8px 14px", borderRadius: 8, transition: "color 0.15s, background 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#8B6914"; (e.currentTarget as HTMLElement).style.background = "rgba(139,105,20,0.06)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#5a4a38"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >{link.label}</Link>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={openCart} style={{ position: "relative", background: "transparent", border: "none", cursor: "pointer", color: "#3a2e24", padding: 8, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, minWidth: 44, minHeight: 44, transition: "color 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#8B6914"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#3a2e24"; }}
            aria-label={`Cart (${totalItems} items)`}
          >
            <IconCart size={22} />
            {totalItems > 0 && (
              <span style={{ position: "absolute", top: 2, right: 2, background: "#8B6914", color: "#fff", width: 18, height: 18, borderRadius: "50%", fontSize: 11, fontWeight: 700, fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </button>

          <button onClick={() => setMobileMenuOpen(v => !v)} className="shopnav-hamburger"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#3a2e24", padding: 8, display: "none", alignItems: "center", justifyContent: "center", borderRadius: 8, minWidth: 44, minHeight: 44 }}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <IconX size={22} /> : <IconMenu size={22} />}
          </button>
        </div>
      </div>

      <div ref={menuRef} style={{ overflow: "hidden", maxHeight: mobileMenuOpen ? 300 : 0, transition: "max-height 0.25s ease", borderTop: mobileMenuOpen ? "1px solid #ede8df" : "none", background: "#fff" }} className="shopnav-mobile-menu">
        <nav style={{ padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)}
              style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, fontWeight: 500, color: "#3a2e24", textDecoration: "none", padding: "12px 8px", borderBottom: "1px solid #f5f0e8" }}
            >{link.label}</Link>
          ))}
        </nav>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .shopnav-desktop { display: flex !important; }
          .shopnav-hamburger { display: none !important; }
          .shopnav-mobile-menu { display: none !important; }
        }
        @media (max-width: 767px) {
          .shopnav-desktop { display: none !important; }
          .shopnav-hamburger { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
