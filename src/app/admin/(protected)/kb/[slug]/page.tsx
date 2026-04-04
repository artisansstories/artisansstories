"use client";

import { useEffect, useState, use } from "react";
import { marked } from "marked";

const GOLD = "#8B6914";
const CATEGORIES = ["Getting Started", "Products", "Orders", "Customers", "Operations", "Technical", "General"];

interface Article {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  readTimeMin: number;
  publishedAt: string;
  updatedAt: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif", background: "#fefce8", color: GOLD, border: "1px solid #fde68a" }}>
      {category}
    </span>
  );
}

function IconArrowLeft({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function IconEdit({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = markdown.split("\n");
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (m) {
      const text = m[2].trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      items.push({ id, text, level: m[1].length });
    }
  }
  return items;
}

function renderMarkdown(content: string): string {
  const renderer = new marked.Renderer();
  renderer.heading = function ({ text, depth }: { text: string; depth: number }) {
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };
  marked.setOptions({ renderer });
  return marked.parse(content) as string;
}

export default function KBArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Edit fields
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editExcerpt, setEditExcerpt] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editReadTime, setEditReadTime] = useState(5);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/kb/articles/${slug}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setArticle(data.article);
        setEditTitle(data.article.title);
        setEditCategory(data.article.category);
        setEditExcerpt(data.article.excerpt);
        setEditContent(data.article.content);
        setEditReadTime(data.article.readTimeMin);
      } catch {
        setError("Article not found.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/admin/kb/articles/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          category: editCategory,
          excerpt: editExcerpt,
          content: editContent,
          readTimeMin: editReadTime,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setArticle(data.article);
      setEditing(false);
      setPreview(false);
    } catch {
      setSaveError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (!article) return;
    setEditTitle(article.title);
    setEditCategory(article.category);
    setEditExcerpt(article.excerpt);
    setEditContent(article.content);
    setEditReadTime(article.readTimeMin);
    setEditing(false);
    setPreview(false);
    setSaveError("");
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ height: 20, background: "#f5f0e8", borderRadius: 6, width: 120, marginBottom: 24 }} />
        <div style={{ height: 32, background: "#f5f0e8", borderRadius: 8, width: "60%", marginBottom: 16 }} />
        <div style={{ height: 16, background: "#f5f0e8", borderRadius: 6, width: "80%", marginBottom: 8 }} />
        <div style={{ height: 16, background: "#f5f0e8", borderRadius: 6, width: "70%" }} />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "60px 0", textAlign: "center" }}>
        <p style={{ color: "#ef4444", fontFamily: "'Inter',sans-serif" }}>{error || "Article not found."}</p>
        <a href="/admin/kb" style={{ color: GOLD, fontFamily: "'Inter',sans-serif", fontSize: 14 }}>← Back to Knowledge Base</a>
      </div>
    );
  }

  const toc = extractToc(editing ? editContent : article.content);

  return (
    <>
      <style>{`
        .kb-content h1 { font-family: 'Cormorant Garamond', serif; font-size: 24px; font-weight: 600; color: #111827; margin: 28px 0 12px; }
        .kb-content h2 { font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 700; color: #111827; margin: 28px 0 10px; padding-bottom: 8px; border-bottom: 1.5px solid #fef3c7; }
        .kb-content h3 { font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 700; color: #374151; margin: 22px 0 8px; }
        .kb-content p { font-family: 'Inter', sans-serif; font-size: 15px; color: #374151; line-height: 1.75; margin: 0 0 14px; }
        .kb-content ul, .kb-content ol { font-family: 'Inter', sans-serif; font-size: 15px; color: #374151; line-height: 1.75; margin: 0 0 14px; padding-left: 24px; }
        .kb-content li { margin-bottom: 4px; }
        .kb-content code { font-family: 'Menlo','Monaco','Consolas',monospace; font-size: 13px; background: #fef9ee; border: 1px solid #fde68a; color: #92400e; border-radius: 4px; padding: 1px 5px; }
        .kb-content pre { background: #1c1917; border-radius: 10px; padding: 18px 20px; overflow-x: auto; margin: 0 0 18px; }
        .kb-content pre code { background: none; border: none; color: #e7e5e4; padding: 0; font-size: 13.5px; }
        .kb-content blockquote { border-left: 3px solid ${GOLD}; padding: 8px 16px; margin: 0 0 16px; background: #fffbeb; border-radius: 0 8px 8px 0; }
        .kb-content blockquote p { color: #78716c; margin: 0; font-style: italic; }
        .kb-content table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-family: 'Inter', sans-serif; font-size: 14px; }
        .kb-content th { background: #fffbeb; color: #374151; font-weight: 600; padding: 10px 14px; border: 1px solid #e7e0d5; text-align: left; }
        .kb-content td { padding: 10px 14px; border: 1px solid #e7e0d5; color: #374151; }
        .kb-content a { color: ${GOLD}; text-decoration: none; }
        .kb-content a:hover { text-decoration: underline; }
        .kb-content strong { color: #1c1917; }
        .kb-content hr { border: none; border-top: 1px solid #e7e0d5; margin: 24px 0; }
        .toc-link:hover { color: ${GOLD} !important; }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Back link */}
        <a href="/admin/kb" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#78716c", textDecoration: "none", fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 20 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#78716c"; }}
        >
          <IconArrowLeft size={14} /> Back to Knowledge Base
        </a>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 12, color: "#a8a29e", fontFamily: "'Inter',sans-serif" }}>
          <a href="/admin/kb" style={{ color: "#a8a29e", textDecoration: "none" }}>Knowledge Base</a>
          <span>/</span>
          <span style={{ color: GOLD }}>{article.category}</span>
          <span>/</span>
          <span style={{ color: "#57534e" }}>{article.title}</span>
        </div>

        <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Article header card */}
            <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "24px 28px", marginBottom: 24, position: "relative" }}>
              {!editing && (
                <button onClick={() => setEditing(true)} style={{ position: "absolute", top: 20, right: 20, display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: `1.5px solid ${GOLD}`, borderRadius: 8, background: "transparent", color: GOLD, fontSize: 13, fontFamily: "'Inter',sans-serif", fontWeight: 500, cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#fffbeb"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <IconEdit size={14} /> Edit Article
                </button>
              )}
              <div style={{ marginBottom: 12 }}>
                <CategoryBadge category={article.category} />
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1c1917", fontFamily: "'Cormorant Garamond',serif", margin: "0 0 12px", lineHeight: 1.3, paddingRight: editing ? 0 : 120 }}>
                {article.title}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#a8a29e", fontFamily: "'Inter',sans-serif" }}>
                <span>{article.readTimeMin} min read</span>
                <span>·</span>
                <span>Updated {new Date(article.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
            </div>

            {/* Edit form */}
            {editing ? (
              <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "24px 28px" }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1c1917", fontFamily: "'Inter',sans-serif", margin: "0 0 20px" }}>Edit Article</h2>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#57534e", fontFamily: "'Inter',sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Title</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e7e0d5", borderRadius: 8, fontSize: 14, fontFamily: "'Inter',sans-serif", color: "#1c1917", outline: "none" }}
                    onFocus={e => { (e.target as HTMLInputElement).style.borderColor = GOLD; }}
                    onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#e7e0d5"; }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#57534e", fontFamily: "'Inter',sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</label>
                    <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e7e0d5", borderRadius: 8, fontSize: 14, fontFamily: "'Inter',sans-serif", color: "#1c1917", background: "#fff", outline: "none" }}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#57534e", fontFamily: "'Inter',sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Read Time (min)</label>
                    <input type="number" value={editReadTime} onChange={e => setEditReadTime(Number(e.target.value))} min={1}
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e7e0d5", borderRadius: 8, fontSize: 14, fontFamily: "'Inter',sans-serif", color: "#1c1917", outline: "none" }}
                      onFocus={e => { (e.target as HTMLInputElement).style.borderColor = GOLD; }}
                      onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#e7e0d5"; }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#57534e", fontFamily: "'Inter',sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Excerpt</label>
                  <textarea value={editExcerpt} onChange={e => setEditExcerpt(e.target.value)} rows={2}
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e7e0d5", borderRadius: 8, fontSize: 14, fontFamily: "'Inter',sans-serif", color: "#1c1917", resize: "vertical", outline: "none" }}
                    onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = GOLD; }}
                    onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = "#e7e0d5"; }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#57534e", fontFamily: "'Inter',sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>Content (Markdown)</label>
                    <button onClick={() => setPreview(!preview)} style={{ fontSize: 12, color: GOLD, fontFamily: "'Inter',sans-serif", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                      {preview ? "Edit" : "Preview"}
                    </button>
                  </div>
                  {preview ? (
                    <div className="kb-content" style={{ background: "#faf7f2", border: "1.5px solid #e7e0d5", borderRadius: 8, padding: "16px 20px", minHeight: 500 }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
                    />
                  ) : (
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                      style={{ width: "100%", padding: "12px", border: "1.5px solid #e7e0d5", borderRadius: 8, fontSize: 13, fontFamily: "'Menlo','Monaco','Consolas',monospace", color: "#1c1917", resize: "vertical", minHeight: 500, outline: "none", lineHeight: 1.6 }}
                      onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = GOLD; }}
                      onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = "#e7e0d5"; }}
                    />
                  )}
                </div>

                {saveError && (
                  <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#ef4444", fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 14 }}>
                    {saveError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={handleSave} disabled={saving}
                    style={{ padding: "10px 22px", borderRadius: 9, background: GOLD, color: "#fff", border: "none", fontSize: 14, fontFamily: "'Inter',sans-serif", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, transition: "opacity 0.15s" }}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button onClick={handleCancel}
                    style={{ padding: "10px 22px", borderRadius: 9, background: "transparent", color: "#57534e", border: "1.5px solid #e7e0d5", fontSize: 14, fontFamily: "'Inter',sans-serif", fontWeight: 500, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Article body */
              <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 16, padding: "28px 32px" }}>
                <div className="kb-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }} />
              </div>
            )}
          </div>

          {/* TOC sidebar (desktop only) */}
          {!editing && toc.length > 1 && (
            <div style={{ width: 220, flexShrink: 0, position: "sticky", top: 90 }} className="kb-toc">
              <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "16px 18px" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#a8a29e", fontFamily: "'Inter',sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>On this page</p>
                <nav>
                  {toc.map(item => (
                    <a key={item.id} href={`#${item.id}`} className="toc-link"
                      style={{ display: "block", fontSize: 13, fontFamily: "'Inter',sans-serif", color: "#57534e", textDecoration: "none", padding: "4px 0", paddingLeft: item.level === 1 ? 0 : item.level === 2 ? 0 : 12, lineHeight: 1.4, transition: "color 0.12s" }}>
                      {item.text}
                    </a>
                  ))}
                </nav>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .kb-toc { display: none !important; }
        }
      `}</style>
    </>
  );
}
