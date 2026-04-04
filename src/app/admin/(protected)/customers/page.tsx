"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Customer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: string | null;
  createdAt: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(search && { search }),
      });
      const res = await fetch(`/api/admin/customers?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCustomers(data.customers);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function fmtMoney(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function fmtDate(date: string | null) {
    if (!date) return "—";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
  }

  return (
    <div>
      <style>{`
        @media (max-width: 767px) { .cust-table { display: none !important; } .cust-cards { display: block !important; } }
        @media (min-width: 768px) { .cust-table { display: table !important; } .cust-cards { display: none !important; } }
      `}</style>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: "#3a2e24", margin: "0 0 4px" }}>Customers</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>
          {total} customer{total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Search */}
      <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email…"
            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #e0d5c5", fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#3a2e24", background: "#fefcf9", outline: "none" }}
          />
          <button type="submit" style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            Search
          </button>
          {search && (
            <button type="button" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 14, cursor: "pointer", color: "#5a4a38" }}>
              Clear
            </button>
          )}
        </form>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : customers.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#9a876e", margin: 0 }}>
            {search ? "No customers match your search" : "No customers yet"}
          </p>
        </div>
      ) : (
        <>
          <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden" }}>
            {/* Desktop table */}
            <table className="cust-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ede8df" }}>
                  {["Customer", "Total Orders", "Total Spent", "Last Order", "Joined", ""].map((h) => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((c, idx) => (
                  <tr key={c.id}
                    style={{ borderBottom: idx < customers.length - 1 ? "1px solid #f5f0e8" : "none", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                            {(c.firstName?.[0] ?? c.email[0]).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 500, color: "#3a2e24", margin: "0 0 1px" }}>
                            {c.firstName || c.lastName ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : "—"}
                          </p>
                          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e", margin: 0 }}>{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#3a2e24", textAlign: "center" }}>{c.totalOrders}</td>
                    <td style={{ padding: "14px 16px", fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#3a2e24", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(c.totalSpent)}</td>
                    <td style={{ padding: "14px 16px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e" }}>{fmtDate(c.lastOrderAt)}</td>
                    <td style={{ padding: "14px 16px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e" }}>{fmtDate(c.createdAt)}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <Link href={`/admin/customers/${c.id}`} style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#8B6914", fontWeight: 500, textDecoration: "none" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="cust-cards" style={{ display: "none" }}>
              {customers.map((c) => (
                <div key={c.id} style={{ padding: "16px", borderBottom: "1px solid #f5f0e8" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ color: "#fff", fontSize: 16, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                        {(c.firstName?.[0] ?? c.email[0]).toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, color: "#3a2e24", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.firstName || c.lastName ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : c.email}
                      </p>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</p>
                    </div>
                    <Link href={`/admin/customers/${c.id}`} style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#8B6914", fontWeight: 500, textDecoration: "none", flexShrink: 0 }}>View</Link>
                  </div>
                  <div style={{ display: "flex", gap: 20 }}>
                    <div>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#9a876e", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Orders</p>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, color: "#3a2e24", margin: 0 }}>{c.totalOrders}</p>
                    </div>
                    <div>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#9a876e", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Spent</p>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, color: "#3a2e24", margin: 0 }}>{fmtMoney(c.totalSpent)}</p>
                    </div>
                    <div>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#9a876e", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Joined</p>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#5a4a38", margin: 0 }}>{fmtDate(c.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 14, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1, color: "#5a4a38" }}>
                Previous
              </button>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e" }}>Page {page} of {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 14, cursor: page === pages ? "not-allowed" : "pointer", opacity: page === pages ? 0.5 : 1, color: "#5a4a38" }}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
