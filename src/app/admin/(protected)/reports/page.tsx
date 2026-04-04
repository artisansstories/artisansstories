"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "sales" | "products" | "customers" | "discounts";

interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

interface SalesData {
  dailyRevenue: DailyRevenue[];
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  revenueChange: number;
  ordersChange: number;
}

interface ProductItem {
  productId: string;
  productName: string;
  revenue: number;
  unitsSold: number;
  imageUrl?: string;
}

interface LowStockItem {
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  threshold: number;
  sku?: string;
}

interface ProductsData {
  topByRevenue: ProductItem[];
  topByUnits: ProductItem[];
  lowStock: LowStockItem[];
}

interface CustomerItem {
  customerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  totalSpent: number;
  totalOrders: number;
  lastOrderAt?: string;
}

interface CustomersData {
  totalCustomers: number;
  newThisMonth: number;
  returningThisMonth: number;
  topByLifetimeValue: CustomerItem[];
}

type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";

interface DiscountItem {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  usageCount: number;
  totalRevenue: number;
  isActive: boolean;
}

interface DiscountsData {
  discounts: DiscountItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100
  );
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(dateStr));
}

function formatShortDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(dateStr + "T00:00:00")
  );
}

function toDateInput(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { start: toDateInput(start), end: toDateInput(end) };
}

// ─── Shimmer Skeleton ──────────────────────────────────────────────────────────

function Shimmer({ width = "100%", height = 20 }: { width?: string | number; height?: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background: "linear-gradient(90deg, #f0ebe3 25%, #e8e2d9 50%, #f0ebe3 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s infinite",
      }}
    />
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  change,
  color,
  loading,
}: {
  label: string;
  value: string;
  change?: number;
  color: string;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #ede8df",
        borderRadius: 12,
        padding: "20px 24px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <p
        style={{
          fontSize: 12,
          color: "#9a876e",
          fontFamily: "'Inter', sans-serif",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: "0 0 8px",
        }}
      >
        {label}
      </p>
      {loading ? (
        <Shimmer height={28} />
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <p
            style={{
              fontSize: 26,
              fontWeight: 700,
              color,
              fontFamily: "'Inter', sans-serif",
              margin: 0,
            }}
          >
            {value}
          </p>
          {change !== undefined && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
                color: change >= 0 ? "#15803d" : "#b91c1c",
                background: change >= 0 ? "#dcfce7" : "#fee2e2",
                padding: "2px 8px",
                borderRadius: 100,
              }}
            >
              {change >= 0 ? "+" : ""}
              {change}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Error State ──────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "48px 24px",
        color: "#b91c1c",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <p style={{ marginBottom: 12, fontSize: 14 }}>Failed to load data. Try again.</p>
      <button
        onClick={onRetry}
        style={{
          padding: "8px 18px",
          borderRadius: 8,
          border: "1px solid #8B6914",
          background: "#8B6914",
          color: "#fff",
          fontSize: 13,
          fontFamily: "'Inter', sans-serif",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

// ─── Sales Tab ────────────────────────────────────────────────────────────────

function SalesTab() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [applied, setApplied] = useState({ start: defaults.start, end: defaults.end });
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/admin/reports/sales?startDate=${start}&endDate=${end}`
      );
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(applied.start, applied.end);
  }, [applied, fetchData]);

  function handleApply() {
    setApplied({ start: startDate, end: endDate });
  }

  function handleExportCsv() {
    if (!data) return;
    const csv = ["Date,Revenue,Orders"];
    data.dailyRevenue.forEach((d) =>
      csv.push(`${d.date},$${(d.revenue / 100).toFixed(2)},${d.orders}`)
    );
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #ede8df",
    background: "#fff",
    fontSize: 13,
    fontFamily: "'Inter', sans-serif",
    color: "#3a2e24",
    outline: "none",
  };

  return (
    <div>
      {/* Date range controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 24,
          background: "#fff",
          border: "1px solid #ede8df",
          borderRadius: 12,
          padding: "16px 20px",
        }}
      >
        <label style={{ fontSize: 13, color: "#5a4a38", fontFamily: "'Inter', sans-serif" }}>
          From
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={inputStyle}
        />
        <label style={{ fontSize: 13, color: "#5a4a38", fontFamily: "'Inter', sans-serif" }}>
          To
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={inputStyle}
        />
        <button
          onClick={handleApply}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "none",
            background: "#8B6914",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            cursor: "pointer",
          }}
        >
          Apply
        </button>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={handleExportCsv}
            disabled={!data || loading}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #ede8df",
              background: "#fff",
              color: "#5a4a38",
              fontSize: 13,
              fontFamily: "'Inter', sans-serif",
              cursor: data && !loading ? "pointer" : "not-allowed",
              opacity: data && !loading ? 1 : 0.5,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {error ? (
        <ErrorState onRetry={() => fetchData(applied.start, applied.end)} />
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <StatCard
              label="Total Revenue"
              value={data ? formatPrice(data.totalRevenue) : "-"}
              change={data?.revenueChange}
              color="#15803d"
              loading={loading}
            />
            <StatCard
              label="Total Orders"
              value={data ? String(data.totalOrders) : "-"}
              change={data?.ordersChange}
              color="#1d4ed8"
              loading={loading}
            />
            <StatCard
              label="Avg Order Value"
              value={data ? formatPrice(data.avgOrderValue) : "-"}
              color="#7c3aed"
              loading={loading}
            />
          </div>

          {/* Bar chart */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              padding: "24px 20px 16px",
            }}
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#3a2e24",
                fontFamily: "'Inter', sans-serif",
                margin: "0 0 20px",
              }}
            >
              Daily Revenue
            </p>
            {loading ? (
              <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shimmer width="100%" height={300} />
              </div>
            ) : data && data.dailyRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.dailyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8df" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatShortDate}
                    tick={{ fontSize: 11, fontFamily: "Inter, sans-serif", fill: "#9a876e" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                    tick={{ fontSize: 11, fontFamily: "Inter, sans-serif", fill: "#9a876e" }}
                    width={56}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => {
                      const num = typeof value === "number" ? value : 0;
                      return name === "revenue"
                        ? [`$${(num / 100).toFixed(2)}`, "Revenue"]
                        : [num, "Orders"];
                    }}
                    labelFormatter={(label) => formatShortDate(label)}
                    contentStyle={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid #ede8df",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Bar dataKey="revenue" fill="#8B6914" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: 300,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#9a876e",
                  fontSize: 14,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                No sales data for this period.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab() {
  const [data, setData] = useState<ProductsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/reports/products");
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: "#9a876e",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    fontFamily: "'Inter', sans-serif",
    borderBottom: "1px solid #ede8df",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    color: "#3a2e24",
    fontFamily: "'Inter', sans-serif",
    borderBottom: "1px solid #f5f1ec",
    verticalAlign: "middle",
  };

  if (error) return <ErrorState onRetry={fetchData} />;

  return (
    <div>
      {/* Top tables row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {/* Top by Revenue */}
        <div
          style={{
            flex: 1,
            minWidth: 280,
            background: "#fff",
            border: "1px solid #ede8df",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #ede8df" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", margin: 0 }}>
              Top by Revenue
            </p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 32 }}>#</th>
                  <th style={thStyle}>Product</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Revenue</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Units</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td style={tdStyle}><Shimmer width={20} height={14} /></td>
                      <td style={tdStyle}><Shimmer height={14} /></td>
                      <td style={tdStyle}><Shimmer width={60} height={14} /></td>
                      <td style={tdStyle}><Shimmer width={40} height={14} /></td>
                    </tr>
                  ))
                  : data?.topByRevenue.map((p, i) => (
                    <tr key={p.productId}>
                      <td style={{ ...tdStyle, color: "#9a876e", fontWeight: 600 }}>{i + 1}</td>
                      <td style={tdStyle}>
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {p.productName}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{formatPrice(p.revenue)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{p.unitsSold}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top by Units */}
        <div
          style={{
            flex: 1,
            minWidth: 280,
            background: "#fff",
            border: "1px solid #ede8df",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #ede8df" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", margin: 0 }}>
              Top by Units Sold
            </p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 32 }}>#</th>
                  <th style={thStyle}>Product</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Units</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td style={tdStyle}><Shimmer width={20} height={14} /></td>
                      <td style={tdStyle}><Shimmer height={14} /></td>
                      <td style={tdStyle}><Shimmer width={40} height={14} /></td>
                      <td style={tdStyle}><Shimmer width={60} height={14} /></td>
                    </tr>
                  ))
                  : data?.topByUnits.map((p, i) => (
                    <tr key={p.productId}>
                      <td style={{ ...tdStyle, color: "#9a876e", fontWeight: 600 }}>{i + 1}</td>
                      <td style={tdStyle}>
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {p.productName}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{p.unitsSold}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(p.revenue)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Low Stock */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #ede8df",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #ede8df" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", margin: 0 }}>
            Low Stock Alert
          </p>
        </div>
        {loading ? (
          <div style={{ padding: 24 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ marginBottom: 12 }}><Shimmer height={20} /></div>
            ))}
          </div>
        ) : !data?.lowStock.length ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              color: "#15803d",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
            }}
          >
            All products are well-stocked! 🎉
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Variant</th>
                  <th style={thStyle}>SKU</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((item) => {
                  const isOos = item.quantity === 0;
                  const rowBg = isOos ? "#fff5f5" : "#fffbeb";
                  return (
                    <tr key={item.variantId} style={{ background: rowBg }}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{item.productName}</td>
                      <td style={tdStyle}>{item.variantName}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "#6b7280" }}>
                        {item.sku ?? "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: isOos ? "#b91c1c" : "#b45309" }}>
                        {item.quantity}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "#9a876e" }}>
                        {item.threshold}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Customers Tab ────────────────────────────────────────────────────────────

function CustomersTab() {
  const [data, setData] = useState<CustomersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/reports/customers");
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: "#9a876e",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    fontFamily: "'Inter', sans-serif",
    borderBottom: "1px solid #ede8df",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    color: "#3a2e24",
    fontFamily: "'Inter', sans-serif",
    borderBottom: "1px solid #f5f1ec",
    verticalAlign: "middle",
  };

  if (error) return <ErrorState onRetry={fetchData} />;

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard
          label="Total Customers"
          value={data ? String(data.totalCustomers) : "-"}
          color="#3a2e24"
          loading={loading}
        />
        <StatCard
          label="New This Month"
          value={data ? String(data.newThisMonth) : "-"}
          color="#15803d"
          loading={loading}
        />
        <StatCard
          label="Returning This Month"
          value={data ? String(data.returningThisMonth) : "-"}
          color="#1d4ed8"
          loading={loading}
        />
      </div>

      {/* Top customers table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #ede8df",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #ede8df" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", margin: 0 }}>
            Top Customers by Lifetime Value
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 32 }}>#</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Name</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total Spent</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Orders</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Last Order</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} style={tdStyle}><Shimmer height={14} /></td>
                    ))}
                  </tr>
                ))
                : data?.topByLifetimeValue.map((c, i) => (
                  <tr key={c.customerId}>
                    <td style={{ ...tdStyle, color: "#9a876e", fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ ...tdStyle, maxWidth: 200 }}>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 12,
                          fontFamily: "monospace",
                          color: "#5a4a38",
                        }}
                      >
                        {c.email}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {c.firstName || c.lastName
                        ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()
                        : <span style={{ color: "#c0b09a" }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#8B6914" }}>
                      {formatPrice(c.totalSpent)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.totalOrders}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#9a876e" }}>
                      {c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Discounts Tab ────────────────────────────────────────────────────────────

function DiscountsTab() {
  const [data, setData] = useState<DiscountsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/reports/discounts");
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function formatDiscountValue(type: DiscountType, value: number): string {
    if (type === "PERCENTAGE") return `${value}%`;
    if (type === "FIXED_AMOUNT") return formatPrice(value);
    return "Free Shipping";
  }

  function formatDiscountType(type: DiscountType): string {
    if (type === "PERCENTAGE") return "Percentage";
    if (type === "FIXED_AMOUNT") return "Fixed Amount";
    return "Free Shipping";
  }

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 600,
    color: "#9a876e",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    fontFamily: "'Inter', sans-serif",
    borderBottom: "1px solid #ede8df",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 13,
    color: "#3a2e24",
    fontFamily: "'Inter', sans-serif",
    borderBottom: "1px solid #f5f1ec",
    verticalAlign: "middle",
  };

  if (error) return <ErrorState onRetry={fetchData} />;

  return (
    <div>
      <div
        style={{
          background: "#fff",
          border: "1px solid #ede8df",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #ede8df" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", margin: 0 }}>
            Discount Performance
          </p>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ marginBottom: 14 }}><Shimmer height={20} /></div>
            ))}
          </div>
        ) : !data?.discounts.length ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "#9a876e",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
            }}
          >
            No discounts have been created yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 24 }}></th>
                  <th style={thStyle}>Code</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Value</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Usage</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Revenue Impact</th>
                </tr>
              </thead>
              <tbody>
                {data.discounts.map((d) => (
                  <tr key={d.id}>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: d.isActive ? "#15803d" : "#9ca3af",
                        }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <code
                        style={{
                          fontFamily: "monospace",
                          fontSize: 13,
                          background: "#f5f1ec",
                          padding: "2px 8px",
                          borderRadius: 4,
                          color: "#5a4a38",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {d.code}
                      </code>
                    </td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>{formatDiscountType(d.type)}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{formatDiscountValue(d.type, d.value)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{d.usageCount}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "#8B6914" }}>
                      {formatPrice(d.totalRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "sales", label: "Sales" },
  { id: "products", label: "Products" },
  { id: "customers", label: "Customers" },
  { id: "discounts", label: "Discounts" },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("sales");

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: "clamp(22px, 3vw, 28px)",
            fontWeight: 600,
            fontFamily: "'Cormorant Garamond', serif",
            color: "#3a2e24",
            margin: "0 0 4px",
            letterSpacing: "0.01em",
          }}
        >
          Reports
        </h1>
        <p style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", margin: 0 }}>
          Analytics and performance insights
        </p>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #ede8df",
          marginBottom: 24,
          gap: 0,
          overflowX: "auto",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 20px",
                border: "none",
                borderBottom: isActive ? "2px solid #8B6914" : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#8B6914" : "#7a6a58",
                fontFamily: "'Inter', sans-serif",
                transition: "color 0.15s",
                whiteSpace: "nowrap",
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "sales" && <SalesTab />}
      {activeTab === "products" && <ProductsTab />}
      {activeTab === "customers" && <CustomersTab />}
      {activeTab === "discounts" && <DiscountsTab />}
    </div>
  );
}
