"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import ProductCard from "@/components/ProductCard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  slug: string;
  name: string;
}

interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  isFeatured: boolean;
  hasVariants: boolean;
  variantId?: string | null;
  tags: string[];
  images: { url: string; urlMedium?: string | null; altText?: string | null }[];
}

interface ApiResponse {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
  categories: Category[];
}

// ─── Sort Options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "best-selling", label: "Best Selling" },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProductSkeleton() {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      overflow: "hidden",
      border: "1px solid #ede8df",
    }}>
      <div style={{
        width: "100%",
        paddingBottom: "100%",
        background: "linear-gradient(90deg, #f0ede8 25%, #ebe7e0 50%, #f0ede8 75%)",
        backgroundSize: "200px 100%",
        animation: "shimmer 1.5s infinite",
      }} />
      <div style={{ padding: "14px 14px 16px" }}>
        <div style={{ height: 16, borderRadius: 4, background: "linear-gradient(90deg,#f0ede8 25%,#ebe7e0 50%,#f0ede8 75%)", backgroundSize: "200px 100%", animation: "shimmer 1.5s infinite", marginBottom: 8 }} />
        <div style={{ height: 14, borderRadius: 4, background: "linear-gradient(90deg,#f0ede8 25%,#ebe7e0 50%,#f0ede8 75%)", backgroundSize: "200px 100%", animation: "shimmer 1.5s infinite", width: "60%", marginBottom: 14 }} />
        <div style={{ height: 40, borderRadius: 8, background: "linear-gradient(90deg,#f0ede8 25%,#ebe7e0 50%,#f0ede8 75%)", backgroundSize: "200px 100%", animation: "shimmer 1.5s infinite" }} />
      </div>
    </div>
  );
}

// ─── Filter Sidebar ───────────────────────────────────────────────────────────

interface FilterState {
  categories: string[];
  minPrice: string;
  maxPrice: string;
  tags: string[];
}

interface FilterPanelProps {
  categories: Category[];
  allTags: string[];
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClose?: () => void;
}

function FilterPanel({ categories, allTags, filters, onChange, onClose }: FilterPanelProps) {
  function toggleCategory(slug: string) {
    const next = filters.categories.includes(slug)
      ? filters.categories.filter(c => c !== slug)
      : [...filters.categories, slug];
    onChange({ ...filters, categories: next });
  }

  function toggleTag(tag: string) {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...filters.tags, tag];
    onChange({ ...filters, tags: next });
  }

  function clearAll() {
    onChange({ categories: [], minPrice: "", maxPrice: "", tags: [] });
  }

  const hasFilters = filters.categories.length > 0 || filters.minPrice || filters.maxPrice || filters.tags.length > 0;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: "1px solid #ede8df",
      }}>
        <h3 style={{
          fontSize: 18,
          fontWeight: 600,
          color: "#3a2e24",
          fontFamily: "'Cormorant Garamond', serif",
        }}>
          Filters
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hasFilters && (
            <button
              onClick={clearAll}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#8B6914",
                fontSize: 12,
                fontFamily: "'Inter', sans-serif",
                textDecoration: "underline",
              }}
            >
              Clear all
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#9a876e",
                padding: 4,
                display: "flex",
              }}
              aria-label="Close filters"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#9a876e",
            marginBottom: 12,
          }}>
            Categories
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.map(cat => (
              <label key={cat.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 14,
                color: filters.categories.includes(cat.slug) ? "#8B6914" : "#5a4a38",
                fontWeight: filters.categories.includes(cat.slug) ? 500 : 400,
              }}>
                <input
                  type="checkbox"
                  checked={filters.categories.includes(cat.slug)}
                  onChange={() => toggleCategory(cat.slug)}
                  style={{ accentColor: "#8B6914", width: 15, height: 15 }}
                />
                {cat.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Price Range */}
      <div style={{ marginBottom: 24 }}>
        <h4 style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#9a876e",
          marginBottom: 12,
        }}>
          Price Range
        </h4>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            placeholder="Min $"
            value={filters.minPrice}
            onChange={e => onChange({ ...filters, minPrice: e.target.value })}
            style={{
              flex: 1,
              padding: "8px 10px",
              border: "1px solid #e0d5c5",
              borderRadius: 6,
              fontSize: 13,
              color: "#3a2e24",
              fontFamily: "'Inter', sans-serif",
              background: "#fff",
              outline: "none",
            }}
            min="0"
          />
          <span style={{ color: "#9a876e", fontSize: 13 }}>–</span>
          <input
            type="number"
            placeholder="Max $"
            value={filters.maxPrice}
            onChange={e => onChange({ ...filters, maxPrice: e.target.value })}
            style={{
              flex: 1,
              padding: "8px 10px",
              border: "1px solid #e0d5c5",
              borderRadius: 6,
              fontSize: 13,
              color: "#3a2e24",
              fontFamily: "'Inter', sans-serif",
              background: "#fff",
              outline: "none",
            }}
            min="0"
          />
        </div>
      </div>

      {/* Tags */}
      {allTags.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#9a876e",
            marginBottom: 12,
          }}>
            Tags
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allTags.map(tag => (
              <label key={tag} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 14,
                color: filters.tags.includes(tag) ? "#8B6914" : "#5a4a38",
                fontWeight: filters.tags.includes(tag) ? 500 : 400,
              }}>
                <input
                  type="checkbox"
                  checked={filters.tags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                  style={{ accentColor: "#8B6914", width: 15, height: 15 }}
                />
                {tag}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("featured");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    categories: [],
    minPrice: "",
    maxPrice: "",
    tags: [],
  });

  const filterDrawerRef = useRef<HTMLDivElement>(null);

  // Close filter drawer on outside click (mobile)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterDrawerOpen && filterDrawerRef.current && !filterDrawerRef.current.contains(e.target as Node)) {
        setFilterDrawerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterDrawerOpen]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("sort", sort);
      params.set("limit", "12");
      if (filters.categories.length === 1) params.set("category", filters.categories[0]);
      if (filters.minPrice) params.set("minPrice", String(Math.round(parseFloat(filters.minPrice) * 100)));
      if (filters.maxPrice) params.set("maxPrice", String(Math.round(parseFloat(filters.maxPrice) * 100)));
      if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));

      const res = await fetch(`/api/shop/products?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load products");
      const data: ApiResponse = await res.json();

      setProducts(data.products);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      if (data.categories.length > 0) setCategories(data.categories);

      // Collect all unique tags from current product set
      const tagSet = new Set<string>();
      data.products.forEach(p => p.tags.forEach(t => tagSet.add(t)));
      if (tagSet.size > 0) setAllTags(Array.from(tagSet).sort());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [page, sort, filters]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Reset page when filters/sort change
  function handleFilterChange(newFilters: FilterState) {
    setFilters(newFilters);
    setPage(1);
  }

  function handleSortChange(newSort: string) {
    setSort(newSort);
    setPage(1);
  }

  const hasActiveFilters = filters.categories.length > 0 || filters.minPrice || filters.maxPrice || filters.tags.length > 0;

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: calc(200px + 100%) 0; }
        }
        @media (min-width: 768px) {
          .shop-filter-sidebar { display: block !important; }
          .shop-filter-btn { display: none !important; }
          .shop-product-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (min-width: 1200px) {
          .shop-product-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 20px 64px" }}>
        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(28px, 5vw, 44px)",
            fontWeight: 600,
            color: "#3a2e24",
            marginBottom: 8,
          }}>
            Shop
          </h1>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            color: "#9a876e",
          }}>
            {loading ? "Loading..." : `${total} handcrafted ${total === 1 ? "item" : "items"}`}
          </p>
        </div>

        {/* Toolbar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 12,
          flexWrap: "wrap",
        }}>
          {/* Filter button (mobile) */}
          <button
            onClick={() => setFilterDrawerOpen(true)}
            className="shop-filter-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              border: "1.5px solid " + (hasActiveFilters ? "#8B6914" : "#e0d5c5"),
              borderRadius: 8,
              background: hasActiveFilters ? "rgba(139,105,20,0.05)" : "#fff",
              color: hasActiveFilters ? "#8B6914" : "#5a4a38",
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="16" y2="12" />
              <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" />
            </svg>
            Filters {hasActiveFilters && `(${filters.categories.length + filters.tags.length + (filters.minPrice ? 1 : 0) + (filters.maxPrice ? 1 : 0)})`}
          </button>

          {/* Sort */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: "#9a876e",
              whiteSpace: "nowrap",
            }}>
              Sort by:
            </label>
            <select
              value={sort}
              onChange={e => handleSortChange(e.target.value)}
              style={{
                padding: "9px 32px 9px 12px",
                border: "1.5px solid #e0d5c5",
                borderRadius: 8,
                background: "#fff",
                color: "#3a2e24",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
                appearance: "none",
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239a876e' strokeWidth='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
              }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Main content: sidebar + grid */}
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
          {/* Desktop Filter Sidebar */}
          <aside
            className="shop-filter-sidebar"
            style={{
              display: "none",
              width: 240,
              flexShrink: 0,
              background: "#fff",
              border: "1px solid #ede8df",
              borderRadius: 12,
              padding: 20,
              position: "sticky",
              top: 88,
            }}
          >
            <FilterPanel
              categories={categories}
              allTags={allTags}
              filters={filters}
              onChange={handleFilterChange}
            />
          </aside>

          {/* Product Grid + Pagination */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {error ? (
              <div style={{
                textAlign: "center",
                padding: "60px 20px",
                color: "#c0392b",
                fontFamily: "'Inter', sans-serif",
              }}>
                <p style={{ fontSize: 16, marginBottom: 12 }}>{error}</p>
                <button
                  onClick={fetchProducts}
                  style={{
                    padding: "10px 20px",
                    background: "#8B6914",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                  }}
                >
                  Try again
                </button>
              </div>
            ) : loading ? (
              <div
                className="shop-product-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 16,
                }}
              >
                {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
              </div>
            ) : products.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "80px 20px",
                fontFamily: "'Inter', sans-serif",
              }}>
                <p style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 24,
                  color: "#3a2e24",
                  marginBottom: 8,
                }}>
                  No products found
                </p>
                <p style={{ fontSize: 14, color: "#9a876e", marginBottom: 20 }}>
                  Try adjusting your filters or browse all products.
                </p>
                <button
                  onClick={() => handleFilterChange({ categories: [], minPrice: "", maxPrice: "", tags: [] })}
                  style={{
                    padding: "10px 20px",
                    background: "#8B6914",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <>
                <div
                  className="shop-product-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 16,
                    marginBottom: 40,
                  }}
                >
                  {products.map(p => <ProductCard key={p.id} product={p} />)}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}>
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      style={{
                        padding: "8px 14px",
                        border: "1.5px solid #e0d5c5",
                        borderRadius: 8,
                        background: "#fff",
                        color: page === 1 ? "#c9b99a" : "#5a4a38",
                        cursor: page === 1 ? "not-allowed" : "pointer",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        transition: "border-color 0.15s",
                      }}
                    >
                      ← Prev
                    </button>

                    {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 7) {
                        pageNum = i + 1;
                      } else if (page <= 4) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 3) {
                        pageNum = totalPages - 6 + i;
                      } else {
                        pageNum = page - 3 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          style={{
                            width: 38,
                            height: 38,
                            border: pageNum === page ? "none" : "1.5px solid #e0d5c5",
                            borderRadius: 8,
                            background: pageNum === page ? "#8B6914" : "#fff",
                            color: pageNum === page ? "#fff" : "#5a4a38",
                            cursor: "pointer",
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 13,
                            fontWeight: pageNum === page ? 600 : 400,
                            transition: "background 0.15s, color 0.15s",
                          }}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      style={{
                        padding: "8px 14px",
                        border: "1.5px solid #e0d5c5",
                        borderRadius: 8,
                        background: "#fff",
                        color: page === totalPages ? "#c9b99a" : "#5a4a38",
                        cursor: page === totalPages ? "not-allowed" : "pointer",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        transition: "border-color 0.15s",
                      }}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 80,
          opacity: filterDrawerOpen ? 1 : 0,
          pointerEvents: filterDrawerOpen ? "all" : "none",
          transition: "opacity 0.25s",
        }}
        aria-hidden="true"
      />
      <div
        ref={filterDrawerRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(320px, 90vw)",
          background: "#fff",
          zIndex: 81,
          transform: filterDrawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
          overflowY: "auto",
          padding: 20,
          boxShadow: "4px 0 20px rgba(0,0,0,0.1)",
        }}
      >
        <FilterPanel
          categories={categories}
          allTags={allTags}
          filters={filters}
          onChange={f => { handleFilterChange(f); }}
          onClose={() => setFilterDrawerOpen(false)}
        />
      </div>
    </>
  );
}
