"use client";

import { useEffect, useState, useCallback } from "react";

const GOLD = "#8B6914";
const ALL_CATEGORIES = ["All", "Getting Started", "Products", "Orders", "Customers", "Operations", "Technical"];
const PINNED_SLUG = "";

interface Article {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  readTimeMin: number;
  publishedAt: string;
  updatedAt: string;
  matchSnippet?: string | null;
}

function highlight(text: string, term: string) {
  if (!term) return text;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase()
      ? `<mark style="background:#fef08a;color:#713f12;border-radius:2px;padding:0 2px">${p}</mark>`
      : p
  ).join("");
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif", background: "#fefce8", color: GOLD, border: "1px solid #fde68a", letterSpacing: "0.03em" }}>
      {category}
    </span>
  );
}

function IconBook({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconSearch({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ArticleCard({ article, search }: { article: Article; search: string }) {
  const isPinned = article.slug === PINNED_SLUG;
  const snippetText = article.matchSnippet ?? article.excerpt;

  return (
    <a href={`/admin/kb/${article.slug}`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{
        background: "#fff",
        border: isPinned ? `2px solid ${GOLD}` : "1px solid #ede8df",
        borderRadius: 14,
        padding: "20px 22px",
        cursor: "pointer",
        transition: "box-shadow 0.15s, border-color 0.15s",
        height: "100%",
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(139,105,20,0.12)"; (e.currentTarget as HTMLElement).style.borderColor = isPinned ? GOLD : "#c9a84c"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.borderColor = isPinned ? GOLD : "#ede8df"; }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <CategoryBadge category={article.category} />
          {isPinned && (
            <span style={{ fontSize: 11, color: GOLD, fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: "0.05em" }}>PINNED</span>
          )}
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1c1917", fontFamily: "'Inter',sans-serif", margin: "0 0 8px", lineHeight: 1.4 }}
          dangerouslySetInnerHTML={{ __html: highlight(article.title, search) }}
        />
        <p style={{ fontSize: 13.5, color: "#57534e", fontFamily: "'Inter',sans-serif", lineHeight: 1.6, margin: "0 0 14px" }}
          dangerouslySetInnerHTML={{ __html: highlight(snippetText, search) }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#a8a29e", fontFamily: "'Inter',sans-serif" }}>
          <span>{article.readTimeMin} min read</span>
          <span>·</span>
          <span>{new Date(article.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>
    </a>
  );
}

export default function KBPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [articles, setArticles] = useState<Article[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchArticles = useCallback(async (q: string, cat: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      if (cat && cat !== "All") params.set("category", cat);
      const res = await fetch(`/api/admin/kb/articles?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setArticles(data.articles ?? []);
      setAvailableCategories(data.categories ?? []);
    } catch {
      setError("Failed to load articles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchArticles(search, activeCategory), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, activeCategory, fetchArticles]);

  const pinnedArticle = PINNED_SLUG ? articles.find(a => a.slug === PINNED_SLUG) : null;
  const otherArticles = articles.filter(a => a.slug !== PINNED_SLUG);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Hero */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#8B6914,#C9A84C)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff" }}><IconBook size={24} /></span>
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1c1917", fontFamily: "'Cormorant Garamond',serif", margin: 0, letterSpacing: "0.01em" }}>Knowledge Base</h1>
            <p style={{ fontSize: 14, color: "#78716c", fontFamily: "'Inter',sans-serif", margin: 0, marginTop: 2 }}>Resources for the Artisans Stories team</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#a8a29e", pointerEvents: "none" }}>
          <IconSearch size={18} />
        </span>
        <input
          type="text"
          placeholder="Search articles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "11px 14px 11px 42px", fontSize: 14, fontFamily: "'Inter',sans-serif",
            border: "1.5px solid #e7e0d5", borderRadius: 12, outline: "none", background: "#fff",
            color: "#1c1917", transition: "border-color 0.15s",
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = GOLD; }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#e7e0d5"; }}
        />
      </div>

      {/* Category pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
        {ALL_CATEGORIES.map(cat => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: "6px 16px", borderRadius: 20, fontSize: 13, fontFamily: "'Inter',sans-serif",
                fontWeight: isActive ? 600 : 400, cursor: "pointer", border: "none",
                background: isActive ? GOLD : "#f5f0e8",
                color: isActive ? "#fff" : "#78716c",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 14, padding: "20px 22px", minHeight: 160 }}>
              <div style={{ height: 20, background: "#f5f0e8", borderRadius: 6, marginBottom: 12, width: "40%" }} className="shimmer" />
              <div style={{ height: 18, background: "#f5f0e8", borderRadius: 6, marginBottom: 8, width: "85%" }} className="shimmer" />
              <div style={{ height: 14, background: "#f5f0e8", borderRadius: 6, marginBottom: 6, width: "100%" }} className="shimmer" />
              <div style={{ height: 14, background: "#f5f0e8", borderRadius: 6, width: "70%" }} className="shimmer" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#ef4444", fontFamily: "'Inter',sans-serif" }}>{error}</div>
      ) : articles.length === 0 ? (
        <div style={{ padding: "60px 0", textAlign: "center" }}>
          <p style={{ fontSize: 16, color: "#a8a29e", fontFamily: "'Inter',sans-serif" }}>No articles found{search ? ` for "${search}"` : ""}.</p>
        </div>
      ) : (
        <>
          {pinnedArticle && (
            <div style={{ marginBottom: 20 }}>
              <ArticleCard article={pinnedArticle} search={search} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
            {otherArticles.map(article => (
              <ArticleCard key={article.id} article={article} search={search} />
            ))}
          </div>
        </>
      )}

      <style>{`
        .shimmer { animation: shimmer 1.5s infinite; }
        @keyframes shimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @media (max-width: 640px) {
          .kb-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
