"use client";

export default function AdminDashboardPage() {
  const stats = [
    { label: "Total Orders", value: "0", sub: "All time", color: "#8B6914" },
    { label: "Revenue (month)", value: "$0.00", sub: "April 2026", color: "#6b8b14" },
    { label: "Products", value: "0", sub: "Active listings", color: "#146b8b" },
    { label: "Low Stock", value: "0", sub: "Items to restock", color: "#8b3a14" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(24px,4vw,32px)", fontWeight: 500, color: "#3a2e24", marginBottom: 4 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter',sans-serif" }}>
          Welcome back — here&apos;s what&apos;s happening in your store.
        </p>
      </div>

      {/* Stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%,220px),1fr))", gap: 16, marginBottom: 32 }}>
        {stats.map((stat) => (
          <div key={stat.label} style={{
            background: "#fff",
            borderRadius: 14,
            padding: "20px 22px",
            border: "1px solid #ede8df",
            boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
          }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "#9a876e", fontFamily: "'Inter',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              {stat.label}
            </p>
            <p style={{ fontSize: "clamp(26px,4vw,32px)", fontWeight: 700, color: stat.color, fontFamily: "'Inter',sans-serif", marginBottom: 4 }}>
              {stat.value}
            </p>
            <p style={{ fontSize: 12, color: "#b0a090", fontFamily: "'Inter',sans-serif" }}>
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ede8df", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif" }}>
            Recent Orders
          </h2>
          <a href="/admin/orders" style={{ fontSize: 13, color: "#8B6914", fontFamily: "'Inter',sans-serif", textDecoration: "none", fontWeight: 500 }}>
            View all →
          </a>
        </div>

        {/* Empty state */}
        <div style={{ padding: "48px 22px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fdf5ea", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c8a84c" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
          <p style={{ fontSize: 15, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter',sans-serif", marginBottom: 6 }}>
            No orders yet
          </p>
          <p style={{ fontSize: 13, color: "#b0a090", fontFamily: "'Inter',sans-serif" }}>
            Orders will appear here once customers start purchasing.
          </p>
        </div>
      </div>

      {/* Quick links */}
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,200px),1fr))", gap: 12 }}>
        {[
          { href: "/admin/products", label: "Add a Product", desc: "Create your first listing" },
          { href: "/admin/settings", label: "Store Settings", desc: "Configure your store" },
          { href: "/admin/shipping", label: "Shipping Zones", desc: "Set up shipping rates" },
        ].map(link => (
          <a key={link.href} href={link.href} style={{
            background: "#fff",
            borderRadius: 12,
            padding: "16px 18px",
            border: "1px solid #ede8df",
            textDecoration: "none",
            display: "block",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "#c8a84c";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(139,105,20,0.12)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "#ede8df";
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: "#8B6914", fontFamily: "'Inter',sans-serif", marginBottom: 3 }}>{link.label} →</p>
            <p style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter',sans-serif" }}>{link.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
