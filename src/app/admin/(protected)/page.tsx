"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  totalOrders: number;
  monthRevenue: number;
  activeProducts: number;
  lowStock: number;
  monthLabel: string;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  status: string;
  financialStatus: string;
  total: number;
  email: string;
  createdAt: string;
  customer: { firstName: string | null; lastName: string | null } | null;
  items: { variant: { product: { name: string } } }[];
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function fmtDate(d: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    PENDING:    { bg: "#fffbeb", color: "#d97706", label: "Pending" },
    CONFIRMED:  { bg: "#eff6ff", color: "#2563eb", label: "Confirmed" },
    PROCESSING: { bg: "#f0fdf4", color: "#16a34a", label: "Processing" },
    FULFILLED:  { bg: "#f0fdf4", color: "#16a34a", label: "Fulfilled" },
    SHIPPED:    { bg: "#f0f9ff", color: "#0284c7", label: "Shipped" },
    DELIVERED:  { bg: "#dcfce7", color: "#15803d", label: "Delivered" },
    CANCELLED:  { bg: "#fef2f2", color: "#dc2626", label: "Cancelled" },
    PAID:       { bg: "#dcfce7", color: "#15803d", label: "Paid" },
    AUTHORIZED: { bg: "#eff6ff", color: "#2563eb", label: "Authorized" },
    REFUNDED:   { bg: "#fef2f2", color: "#dc2626", label: "Refunded" },
    PARTIALLY_PAID: { bg: "#fffbeb", color: "#d97706", label: "Partial" },
  };
  const s = map[status] ?? { bg: "#f5f0e8", color: "#8a7060", label: status };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats);
        setRecentOrders(data.recentOrders ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statCards = stats
    ? [
        { label: "Total Orders", value: String(stats.totalOrders), sub: "All time", color: "#8B6914" },
        { label: "Revenue (month)", value: fmtMoney(stats.monthRevenue), sub: stats.monthLabel, color: "#166534" },
        { label: "Products", value: String(stats.activeProducts), sub: "Active listings", color: "#1e40af" },
        { label: "Low Stock", value: String(stats.lowStock), sub: "Items to restock", color: stats.lowStock > 0 ? "#dc2626" : "#6b7280" },
      ]
    : [
        { label: "Total Orders", value: "—", sub: "Loading…", color: "#8B6914" },
        { label: "Revenue (month)", value: "—", sub: "Loading…", color: "#166534" },
        { label: "Products", value: "—", sub: "Loading…", color: "#1e40af" },
        { label: "Low Stock", value: "—", sub: "Loading…", color: "#6b7280" },
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
        {statCards.map((stat) => (
          <div key={stat.label} style={{
            background: "#fff",
            borderRadius: 14,
            padding: "20px 22px",
            border: "1px solid #ede8df",
            boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
            position: "relative",
          }}>
            {loading && (
              <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 20, height: 20, border: "2px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
            )}
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Recent orders */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ede8df", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", marginBottom: 24 }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif", margin: 0 }}>
            Recent Orders
          </h2>
          <Link href="/admin/orders" style={{ fontSize: 13, color: "#8B6914", fontFamily: "'Inter',sans-serif", textDecoration: "none", fontWeight: 500 }}>
            View all →
          </Link>
        </div>

        {loading ? (
          <div style={{ padding: "40px 22px", textAlign: "center" }}>
            <div style={{ width: 28, height: 28, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          </div>
        ) : recentOrders.length === 0 ? (
          <div style={{ padding: "48px 22px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fdf5ea", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c8a84c" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter',sans-serif", marginBottom: 6 }}>No orders yet</p>
            <p style={{ fontSize: 13, color: "#b0a090", fontFamily: "'Inter',sans-serif" }}>Orders will appear here once customers start purchasing.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ede8df" }}>
                {["Order", "Customer", "Product", "Status", "Date", "Total"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order, idx) => {
                const customerName = order.customer
                  ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ") || order.email
                  : order.email;
                const firstProduct = order.items[0]?.variant?.product?.name ?? "—";
                return (
                  <tr key={order.id}
                    style={{ borderBottom: idx < recentOrders.length - 1 ? "1px solid #f5f0e8" : "none", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/admin/orders/${order.id}`} style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: "#8B6914", textDecoration: "none" }}>
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#3a2e24", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {customerName}
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5a4a38", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {firstProduct}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <StatusPill status={order.status} />
                        <StatusPill status={order.financialStatus} />
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e", whiteSpace: "nowrap" }}>
                      {fmtDate(order.createdAt)}
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: "#3a2e24", whiteSpace: "nowrap" }}>
                      {fmtMoney(order.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick links */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,200px),1fr))", gap: 12 }}>
        {[
          { href: "/admin/products/new", label: "Add a Product", desc: "Create a new listing" },
          { href: "/admin/settings", label: "Store Settings", desc: "Configure your store" },
          { href: "/admin/shipping", label: "Shipping Zones", desc: "Set up shipping rates" },
        ].map((link) => (
          <Link key={link.href} href={link.href} style={{
            background: "#fff",
            borderRadius: 12,
            padding: "16px 18px",
            border: "1px solid #ede8df",
            textDecoration: "none",
            display: "block",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "#c8a84c";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(139,105,20,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "#ede8df";
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: "#8B6914", fontFamily: "'Inter',sans-serif", marginBottom: 3 }}>{link.label} →</p>
            <p style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter',sans-serif", margin: 0 }}>{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
