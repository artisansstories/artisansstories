"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * PlatformLayoutClient (P10) — the operator shell. Deliberately NOT the store
 * admin shell: a dark slate header, a "PLATFORM" wordmark, and its own nav
 * (Dashboard · Tenants · Stripe · API Keys · Settings) so an operator never
 * mistakes "the platform" for "a store."
 */

const ACCENT = "#3D4F7C";
const ACCENT_2 = "#5B6EA8";
const SHELL_BG = "#11182b";
const SHELL_PANEL = "#1a2440";

const NAV_ITEMS = [
  { href: "/platform", label: "Dashboard", icon: IconDashboard, exact: true },
  { href: "/platform/tenants", label: "Tenants", icon: IconBuildings, exact: false },
  { href: "/platform/stripe", label: "Stripe", icon: IconCard, exact: false },
  { href: "/platform/api-keys", label: "API Keys", icon: IconKey, exact: false },
  { href: "/platform/settings", label: "Settings", icon: IconSettings, exact: false },
];

function IconDashboard({ size = 18 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>);
}
function IconBuildings({ size = 18 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="8" width="8" height="13" rx="1"/><path d="M6 7h2M6 11h2M6 15h2M16 12h2M16 16h2"/></svg>);
}
function IconCard({ size = 18 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>);
}
function IconKey({ size = 18 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 7-7"/><path d="m17 6 3 3"/><path d="m14 9 3 3"/></svg>);
}
function IconSettings({ size = 18 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
}
function IconMenu({ size = 22 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>);
}
function IconX({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>);
}

export interface PlatformOperatorProp {
  name: string;
  email: string;
}

export function PlatformLayoutClient({
  children,
  operator,
}: {
  children: React.ReactNode;
  operator: PlatformOperatorProp;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sidebarOpen && drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sidebarOpen]);

  function isActive(item: typeof NAV_ITEMS[number]) {
    return item.exact ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href + "/") || pathname.startsWith(item.href));
  }

  function NavLink({ item }: { item: typeof NAV_ITEMS[number] }) {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <a href={item.href} style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 10, textDecoration: "none",
        fontSize: 14, fontWeight: active ? 600 : 400,
        color: active ? "#fff" : "#a9b3cc",
        background: active ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_2} 100%)` : "transparent",
        transition: "background 0.15s, color 0.15s", fontFamily: "'Inter', sans-serif",
      }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(91,110,168,0.18)"; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ flexShrink: 0 }}><Icon size={18} /></span>
        {item.label}
      </a>
    );
  }

  async function handleSignOut() {
    await fetch("/api/auth/platform/logout", { method: "POST" });
    window.location.href = "/platform/login";
  }

  function SidebarContent() {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "22px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_2} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 16, fontFamily: "'Inter',sans-serif" }}>P</span>
            </div>
            <div>
              <p style={{ color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "0.14em", fontFamily: "'Inter',sans-serif", margin: 0 }}>PLATFORM</p>
              <p style={{ color: "#7e89a8", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Inter',sans-serif", margin: 0 }}>Operator Console</p>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: "14px 10px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_ITEMS.map(item => <NavLink key={item.href} item={item} />)}
        </nav>
        <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_2} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{operator.name?.[0]?.toUpperCase() ?? "O"}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#eef1f7", fontFamily: "'Inter',sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{operator.name}</p>
              <p style={{ fontSize: 11, color: "#8b95b3", fontFamily: "'Inter',sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{operator.email}</p>
            </div>
          </div>
          <button onClick={handleSignOut} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "#c3cbe0", fontSize: 13, fontFamily: "'Inter',sans-serif", cursor: "pointer", transition: "background 0.15s", textAlign: "center" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500;600;700;800&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html { height: 100%; }
        body { height: 100%; font-family: 'Inter', sans-serif; background: #f3f5fa; }
        .platform-sidebar { display: none; }
        .platform-hamburger { display: flex; }
        @media (min-width: 768px) {
          .platform-sidebar { display: block !important; }
          .platform-hamburger { display: none !important; }
        }
      `}</style>

      <div style={{ display: "flex", minHeight: "100dvh" }}>
        <aside style={{ width: 248, flexShrink: 0, background: SHELL_BG, display: "none", position: "sticky", top: 0, height: "100dvh", overflowY: "auto" }} className="platform-sidebar">
          <SidebarContent />
        </aside>

        {sidebarOpen && (<div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }} />)}

        <div ref={drawerRef} style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 264, background: SHELL_BG, zIndex: 50, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform 0.25s ease", overflowY: "auto" }}>
          <button onClick={() => setSidebarOpen(false)} style={{ position: "absolute", top: 16, right: 16, background: "transparent", border: "none", cursor: "pointer", color: "#c3cbe0", padding: 4 }}>
            <IconX size={20} />
          </button>
          <SidebarContent />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header style={{ height: 58, background: SHELL_PANEL, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", position: "sticky", top: 0, zIndex: 30, gap: 12 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#c3cbe0", padding: 6, alignItems: "center" }} className="platform-hamburger">
              <IconMenu size={22} />
            </button>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "0.16em", fontFamily: "'Inter',sans-serif" }}>PLATFORM OPERATOR</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_2} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{operator.name?.[0]?.toUpperCase() ?? "O"}</span>
              </div>
            </div>
          </header>

          <main style={{ flex: 1, padding: "clamp(16px,3vw,32px)", overflowX: "hidden", overflowY: "auto", height: "calc(100dvh - 58px)", background: "#f3f5fa" }}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
