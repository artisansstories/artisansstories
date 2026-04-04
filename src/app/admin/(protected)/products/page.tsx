"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductThumbnail {
  url: string;
  urlThumb: string | null;
  altText: string | null;
}

interface ProductCategory {
  id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  price: number;
  compareAtPrice: number | null;
  variantCount: number;
  totalInventory: number;
  categories: ProductCategory[];
  thumbnail: ProductThumbnail | null;
  artisanName: string | null;
}

interface CategoryOption {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusColor(status: Product["status"]): string {
  if (status === "ACTIVE") return "#15803d";
  if (status === "ARCHIVED") return "#b91c1c";
  return "#6b7280";
}

function statusBg(status: Product["status"]): string {
  if (status === "ACTIVE") return "#dcfce7";
  if (status === "ARCHIVED") return "#fee2e2";
  return "#f3f4f6";
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[40, 200, 90, 80, 60, 120, 80].map((w, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <div style={{ height: 16, width: w, background: "#f0ebe3", borderRadius: 6 }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("categoryId") ?? "");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchProducts = useCallback(async (p = 1, s = search, st = statusFilter, cat = categoryFilter) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (s) qs.set("search", s);
      if (st) qs.set("status", st);
      if (cat) qs.set("categoryId", cat);
      qs.set("page", String(p));
      qs.set("limit", "20");
      const res = await fetch(`/api/admin/products?${qs}`);
      const data = await res.json() as { products: Product[]; total: number; page: number; totalPages: number };
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      showToast("Failed to load products", true);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchProducts(1, search, statusFilter, categoryFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d: { categories: CategoryOption[] }) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchProducts(1, search, statusFilter, categoryFilter);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  }

  async function bulkAction(action: "ACTIVE" | "ARCHIVED" | "DELETE") {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      if (action === "DELETE") {
        await Promise.all(
          [...selected].map((id) => fetch(`/api/admin/products/${id}`, { method: "DELETE" }))
        );
        showToast(`Deleted ${selected.size} product(s)`);
      } else {
        await Promise.all(
          [...selected].map((id) =>
            fetch(`/api/admin/products/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: action }),
            })
          )
        );
        showToast(`Updated ${selected.size} product(s)`);
      }
      setSelected(new Set());
      fetchProducts(page);
    } catch {
      showToast("Bulk action failed", true);
    } finally {
      setBulkLoading(false);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("Product deleted");
      fetchProducts(page);
    } catch {
      showToast("Failed to delete product", true);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "9px 14px",
    border: "1px solid #ede8df",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    color: "#3a2e24",
    background: "#fff",
    outline: "none",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "10px 20px",
    background: "#8B6914",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
  };

  const btnGhost: React.CSSProperties = {
    padding: "8px 14px",
    background: "transparent",
    color: "#6b5540",
    border: "1px solid #ede8df",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
    minHeight: 36,
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 1000,
          background: toast.error ? "#fef2f2" : "#f0fdf4",
          border: `1px solid ${toast.error ? "#fecaca" : "#bbf7d0"}`,
          color: toast.error ? "#b91c1c" : "#15803d",
          padding: "12px 18px", borderRadius: 10,
          fontSize: 14, fontFamily: "'Inter', sans-serif",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(22px,4vw,30px)", fontWeight: 500, color: "#3a2e24", marginBottom: 2 }}>
            Products
          </h1>
          <p style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
            {total} total product{total !== 1 ? "s" : ""}
          </p>
        </div>
        <a href="/admin/products/new" style={btnPrimary}>
          + New Product
        </a>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: "16px 18px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: "1 1 280px" }}>
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="submit" style={{ ...btnPrimary, padding: "9px 16px" }}>Search</button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, minWidth: 130 }}
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ ...inputStyle, minWidth: 150 }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {(search || statusFilter || categoryFilter) && (
          <button
            style={btnGhost}
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setCategoryFilter("");
              fetchProducts(1, "", "", "");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div style={{
          background: "#fdf5ea",
          border: "1px solid #e8d5a3",
          borderRadius: 10,
          padding: "10px 16px",
          marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          fontFamily: "'Inter', sans-serif",
        }}>
          <span style={{ fontSize: 13, color: "#6b4c14", fontWeight: 500 }}>
            {selected.size} selected
          </span>
          <button onClick={() => bulkAction("ACTIVE")} disabled={bulkLoading} style={{ ...btnGhost, borderColor: "#c9a84c", color: "#7a5a00" }}>
            Publish
          </button>
          <button onClick={() => bulkAction("ARCHIVED")} disabled={bulkLoading} style={btnGhost}>
            Archive
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${selected.size} product(s)? This cannot be undone.`)) bulkAction("DELETE");
            }}
            disabled={bulkLoading}
            style={{ ...btnGhost, borderColor: "#fca5a5", color: "#b91c1c" }}
          >
            Delete
          </button>
          <button onClick={() => setSelected(new Set())} style={{ ...btnGhost, marginLeft: "auto" }}>
            Cancel
          </button>
        </div>
      )}

      {/* Table (desktop) */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ede8df", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }} className="products-desktop">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ede8df", background: "#faf7f2" }}>
              <th style={{ width: 40, padding: "12px 16px" }}>
                <input
                  type="checkbox"
                  checked={products.length > 0 && selected.size === products.length}
                  onChange={toggleAll}
                  style={{ cursor: "pointer", width: 16, height: 16 }}
                />
              </th>
              {["Product", "Status", "Price", "Inventory", "Category", "Actions"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "56px 16px", textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fdf5ea", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c8a84c" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                        <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
                      </svg>
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>No products found</p>
                    <p style={{ fontSize: 13, color: "#b0a090", fontFamily: "'Inter', sans-serif" }}>
                      {search || statusFilter || categoryFilter
                        ? "Try adjusting your filters"
                        : "Get started by adding your first product"}
                    </p>
                    {!search && !statusFilter && !categoryFilter && (
                      <a href="/admin/products/new" style={{ ...btnPrimary, marginTop: 8 }}>
                        Add your first product
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} style={{ borderBottom: "1px solid #f5f0e8", transition: "background 0.1s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      style={{ cursor: "pointer", width: 16, height: 16 }}
                    />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {product.thumbnail ? (
                        <img
                          src={product.thumbnail.urlThumb ?? product.thumbnail.url}
                          alt={product.thumbnail.altText ?? product.name}
                          style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid #ede8df", flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 6, background: "#f0ebe3", border: "1px solid #ede8df", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8b89a" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: "#3a2e24", fontFamily: "'Inter', sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                          {product.name}
                        </p>
                        <p style={{ fontSize: 11, color: "#b0a090", fontFamily: "'Inter', sans-serif", margin: 0 }}>
                          /{product.slug}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 500,
                      fontFamily: "'Inter', sans-serif",
                      background: statusBg(product.status),
                      color: statusColor(product.status),
                    }}>
                      {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 14, color: "#3a2e24", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap" }}>
                    {formatPrice(product.price)}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 14, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                    <span style={{ color: product.totalInventory === 0 ? "#b91c1c" : product.totalInventory <= 5 ? "#c2830a" : "#15803d", fontWeight: 500 }}>
                      {product.totalInventory}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>
                    {product.categories.length > 0
                      ? product.categories.map((c) => c.name).join(", ")
                      : <span style={{ color: "#c0b0a0" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <a
                        href={`/admin/products/${product.id}/edit`}
                        style={{ fontSize: 13, color: "#8B6914", fontFamily: "'Inter', sans-serif", textDecoration: "none", fontWeight: 500 }}
                      >
                        Edit
                      </a>
                      <button
                        onClick={() => deleteProduct(product.id)}
                        style={{ fontSize: 13, color: "#b91c1c", fontFamily: "'Inter', sans-serif", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500, padding: 0 }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="products-mobile" style={{ display: "none" }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: 14, marginBottom: 10, display: "flex", gap: 12 }}>
              <div style={{ width: 60, height: 60, borderRadius: 8, background: "#f0ebe3", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 16, background: "#f0ebe3", borderRadius: 6, marginBottom: 8, width: "70%" }} />
                <div style={{ height: 14, background: "#f0ebe3", borderRadius: 6, width: "40%" }} />
              </div>
            </div>
          ))
        ) : products.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: "40px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginBottom: 12 }}>No products found</p>
            <a href="/admin/products/new" style={btnPrimary}>Add your first product</a>
          </div>
        ) : (
          products.map((product) => (
            <div key={product.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: 14, marginBottom: 10, display: "flex", gap: 12 }}>
              <input
                type="checkbox"
                checked={selected.has(product.id)}
                onChange={() => toggleSelect(product.id)}
                style={{ marginTop: 4, cursor: "pointer" }}
              />
              {product.thumbnail ? (
                <img src={product.thumbnail.urlThumb ?? product.thumbnail.url} alt={product.name} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #ede8df", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 60, height: 60, borderRadius: 8, background: "#f0ebe3", border: "1px solid #ede8df", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {product.name}
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: statusBg(product.status), color: statusColor(product.status), fontFamily: "'Inter', sans-serif" }}>
                    {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                  </span>
                  <span style={{ fontSize: 13, color: "#3a2e24", fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                    {formatPrice(product.price)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                  <a href={`/admin/products/${product.id}/edit`} style={{ fontSize: 13, color: "#8B6914", fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>Edit</a>
                  <button onClick={() => deleteProduct(product.id)} style={{ fontSize: 13, color: "#b91c1c", fontFamily: "'Inter', sans-serif", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500, padding: 0 }}>Delete</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, fontFamily: "'Inter', sans-serif", flexWrap: "wrap", gap: 10 }}>
          <p style={{ fontSize: 13, color: "#9a876e" }}>
            Page {page} of {totalPages} &bull; {total} products
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setPage(page - 1); fetchProducts(page - 1); }}
              disabled={page <= 1}
              style={{ ...btnGhost, opacity: page <= 1 ? 0.4 : 1 }}
            >
              ← Previous
            </button>
            <button
              onClick={() => { setPage(page + 1); fetchProducts(page + 1); }}
              disabled={page >= totalPages}
              style={{ ...btnGhost, opacity: page >= totalPages ? 0.4 : 1 }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 768px) {
          .products-desktop { display: block !important; }
          .products-mobile { display: none !important; }
        }
        @media (max-width: 767px) {
          .products-desktop { display: none !important; }
          .products-mobile { display: block !important; }
        }
      `}</style>
    </div>
  );
}
