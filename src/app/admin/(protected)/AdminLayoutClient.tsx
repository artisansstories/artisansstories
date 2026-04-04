"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: IconDashboard, mobileShow: true },
  { href: "/admin/products", label: "Products", icon: IconBox, mobileShow: true },
  { href: "/admin/categories", label: "Categories", icon: IconTag, mobileShow: false },
  { href: "/admin/inventory", label: "Inventory", icon: IconWarehouse, mobileShow: false },
  { href: "/admin/orders", label: "Orders", icon: IconShoppingBag, mobileShow: true },
  { href: "/admin/customers", label: "Customers", icon: IconUsers, mobileShow: false },
  { href: "/admin/returns", label: "Returns", icon: IconReturn, mobileShow: false },
  { href: "/admin/discounts", label: "Discounts", icon: IconPercent, mobileShow: false },
  { href: "/admin/shipping", label: "Shipping", icon: IconTruck, mobileShow: false },
  { href: "/admin/tax", label: "Tax", icon: IconPercent, mobileShow: false },
  { href: "/admin/reports", label: "Reports", icon: IconChart, mobileShow: false },
  { href: "/admin/kb", label: "Knowledge Base", icon: IconBook, mobileShow: false },
  { href: "/admin/team", label: "Team", icon: IconTeam, mobileShow: false },
  { href: "/admin/settings", label: "Settings", icon: IconSettings, mobileShow: true },
];

function IconDashboard({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>);
}
function IconBox({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>);
}
function IconTag({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42Z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/></svg>);
}
function IconWarehouse({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect x="6" y="10" width="12" height="12"/></svg>);
}
function IconShoppingBag({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>);
}
function IconUsers({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
}
function IconReturn({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>);
}
function IconPercent({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>);
}
function IconTruck({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="2"/><circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>);
}
function IconChart({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>);
}
function IconTeam({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
}
function IconBook({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>);
}
function IconSettings({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>);
}
function IconMenu({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>);
}
function IconX({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>);
}

export interface AdminSessionProp {
  name: string;
  email: string;
  role: string;
}

export function AdminLayoutClient({
  children,
  session,
}: {
  children: React.ReactNode;
  session: AdminSessionProp | null;
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

  const user = session;

  function NavLink({ item }: { item: typeof NAV_ITEMS[0] }) {
    const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
    const Icon = item.icon;
    return (
      <a href={item.href} style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 10, textDecoration: "none",
        fontSize: 14, fontWeight: isActive ? 600 : 400,
        color: isActive ? "#8B6914" : "#5a4a38",
        background: isActive ? "rgba(139,105,20,0.1)" : "transparent",
        transition: "background 0.15s, color 0.15s", fontFamily: "'Inter', sans-serif",
      }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(139,105,20,0.06)"; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ flexShrink: 0, color: isActive ? "#8B6914" : "#8a7060" }}><Icon size={18} /></span>
        {item.label}
      </a>
    );
  }

  async function handleSignOut() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  function SidebarContent() {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #ede8df" }}>
          <Image src="/logo-color.png" alt="Artisans' Stories" width={160} height={43} style={{ width: 140, height: "auto" }} unoptimized />
          <p style={{ fontSize: 11, color: "#b09878", fontFamily: "'Inter',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 6 }}>Admin Panel</p>
        </div>
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {NAV_ITEMS.map(item => <NavLink key={item.href} item={item} />)}
        </nav>
        <div style={{ padding: "12px 16px", borderTop: "1px solid #ede8df" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#8B6914,#C9A84C)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{user?.name?.[0]?.toUpperCase() ?? "A"}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name ?? "Admin"}</p>
              <p style={{ fontSize: 11, color: "#9a876e", fontFamily: "'Inter',sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</p>
            </div>
          </div>
          <button onClick={handleSignOut} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", color: "#7a5c3a", fontSize: 13, fontFamily: "'Inter',sans-serif", cursor: "pointer", transition: "background 0.15s", textAlign: "center" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#fdf5ea"; }}
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
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html { height: 100%; }
        body { height: 100%; font-family: 'Inter', sans-serif; background: #faf7f2; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d8cfc0; border-radius: 4px; }
      `}</style>

      <div style={{ display: "flex", minHeight: "100dvh" }}>
        <aside style={{ width: 240, flexShrink: 0, background: "#fff", borderRight: "1px solid #ede8df", display: "none", position: "sticky", top: 0, height: "100dvh", overflowY: "auto" }} className="admin-sidebar">
          <SidebarContent />
        </aside>

        {sidebarOpen && (<div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.4)" }} />)}

        <div ref={drawerRef} style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 260, background: "#fff", borderRight: "1px solid #ede8df", zIndex: 50, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform 0.25s ease", overflowY: "auto" }}>
          <button onClick={() => setSidebarOpen(false)} style={{ position: "absolute", top: 16, right: 16, background: "transparent", border: "none", cursor: "pointer", color: "#8a7060", padding: 4 }}>
            <IconX size={20} />
          </button>
          <SidebarContent />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header style={{ height: 58, background: "#fff", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", position: "sticky", top: 0, zIndex: 30, gap: 12 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b5540", padding: 6, display: "flex", alignItems: "center" }} className="admin-hamburger">
              <IconMenu size={22} />
            </button>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#3a2e24", fontFamily: "'Cormorant Garamond',serif", letterSpacing: "0.02em" }} className="admin-storename">Artisans' Stories</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
              <div style={{ textAlign: "right", display: "none" }} className="admin-userinfo">
                <p style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: 0 }}>{user?.name}</p>
                <p style={{ fontSize: 11, color: "#9a876e", fontFamily: "'Inter',sans-serif", margin: 0 }}>{user?.role}</p>
              </div>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#8B6914,#C9A84C)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{user?.name?.[0]?.toUpperCase() ?? "A"}</span>
              </div>
            </div>
          </header>

          <main style={{ flex: 1, padding: "clamp(16px,3vw,32px)", overflowX: "hidden" }}>
            {children}
          </main>
        </div>

        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30, background: "#fff", borderTop: "1px solid #ede8df", display: "flex", paddingBottom: "env(safe-area-inset-bottom)" }} className="admin-bottom-nav">
          {NAV_ITEMS.filter(i => i.mobileShow).map(item => {
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <a key={item.href} href={item.href} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 4px 8px", textDecoration: "none", color: isActive ? "#8B6914" : "#9a8070", gap: 3, minWidth: 0 }}>
                <Icon size={20} />
                <span style={{ fontSize: 10, fontFamily: "'Inter',sans-serif", fontWeight: isActive ? 600 : 400, letterSpacing: "0.02em" }}>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .admin-sidebar { display: block !important; }
          .admin-hamburger { display: none !important; }
          .admin-bottom-nav { display: none !important; }
          .admin-userinfo { display: block !important; }
          main { padding-bottom: 0 !important; }
        }
        @media (max-width: 767px) {
          main { padding-bottom: calc(68px + env(safe-area-inset-bottom)) !important; }
        }
      `}</style>
    </>
  );
}
