"use client";

import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  position: number;
  parent: { id: string; name: string; slug: string } | null;
  _count: { products: number };
}

// ─── Form defaults ────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    name: "",
    description: "",
    parentId: "",
    imageUrl: "",
    isActive: true,
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formSaving, setFormSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  }

  async function fetchCategories() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/categories");
      const data = await res.json() as { categories: Category[] };
      setCategories(data.categories ?? []);
    } catch {
      showToast("Failed to load categories", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCategories(); }, []);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      description: cat.description ?? "",
      parentId: cat.parentId ?? "",
      imageUrl: cat.imageUrl ?? "",
      isActive: cat.isActive,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { showToast("Name is required", true); return; }
    setFormSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description || undefined,
        parentId: form.parentId || undefined,
        imageUrl: form.imageUrl || undefined,
        isActive: form.isActive,
      };

      const url = editingId ? `/api/admin/categories/${editingId}` : "/api/admin/categories";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Save failed");
      }

      showToast(editingId ? "Category updated!" : "Category created!");
      closeForm();
      fetchCategories();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", true);
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(cat: Category) {
    const msg = cat._count.products > 0
      ? `This category has ${cat._count.products} product(s). Delete anyway? Products will lose this category.`
      : `Delete "${cat.name}"? This cannot be undone.`;
    if (!confirm(msg)) return;

    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string; productCount?: number; success?: boolean };
      if (!res.ok) {
        showToast(data.error ?? "Delete failed", true);
        return;
      }
      showToast("Category deleted");
      fetchCategories();
    } catch {
      showToast("Delete failed", true);
    }
  }

  async function handleToggleActive(cat: Category) {
    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      if (!res.ok) throw new Error();
      fetchCategories();
    } catch {
      showToast("Update failed", true);
    }
  }

  async function movePosition(cat: Category, dir: -1 | 1) {
    const newPos = cat.position + dir;
    if (newPos < 0) return;
    try {
      await fetch(`/api/admin/categories/${cat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: newPos }),
      });
      fetchCategories();
    } catch {
      showToast("Update failed", true);
    }
  }

  async function handleImageUpload(file: File) {
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = await res.json() as { url: string };
      setForm((f) => ({ ...f, imageUrl: data.url }));
      showToast("Image uploaded");
    } catch {
      showToast("Image upload failed", true);
    } finally {
      setImageUploading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    border: "1px solid #ede8df",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    color: "#3a2e24",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
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
    minHeight: 40,
  };

  const btnGhost: React.CSSProperties = {
    padding: "7px 14px",
    background: "transparent",
    color: "#6b5540",
    border: "1px solid #ede8df",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
    minHeight: 34,
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #ede8df",
    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
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
            Categories
          </h1>
          <p style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif" }}>
            {categories.length} total categor{categories.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        <button onClick={openNew} style={btnPrimary}>+ New Category</button>
      </div>

      {/* Inline create/edit form */}
      {showForm && (
        <div style={{ ...cardStyle, padding: "22px 24px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", marginBottom: 18 }}>
            {editingId ? "Edit Category" : "New Category"}
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginBottom: 5 }}>
                  Name <span style={{ color: "#b91c1c" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Textiles"
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginBottom: 5 }}>
                  Parent Category
                </label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">None (top-level)</option>
                  {categories
                    .filter((c) => c.id !== editingId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginBottom: 5 }}>
                Description
              </label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional category description..."
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginBottom: 5 }}>
                Category Image
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {form.imageUrl && (
                  <img src={form.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #ede8df", flexShrink: 0 }} />
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={imageUploading}
                    style={{ ...btnGhost, display: "block", marginBottom: 6 }}
                  >
                    {imageUploading ? "Uploading..." : form.imageUrl ? "Change image" : "Upload image"}
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }}
                  />
                  <input
                    type="text"
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="Or paste image URL..."
                    style={{ ...inputStyle, fontSize: 12 }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  style={{
                    width: 42, height: 24, borderRadius: 12,
                    background: form.isActive ? "#8B6914" : "#d1c4b4",
                    position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: 3, left: form.isActive ? 21 : 3, width: 18, height: 18,
                    borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </div>
                <span style={{ fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#3a2e24" }}>Active</span>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={formSaving} style={btnPrimary}>
                {formSaving ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
              <button type="button" onClick={closeForm} style={btnGhost}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Desktop table */}
      <div style={cardStyle} className="categories-desktop">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ede8df", background: "#faf7f2" }}>
              {["", "Name", "Parent", "Products", "Status", "Actions"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} style={{ padding: "14px 16px" }}>
                      <div style={{ height: 14, background: "#f0ebe3", borderRadius: 5, width: j === 1 ? 150 : 80 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "48px 16px", textAlign: "center" }}>
                  <p style={{ fontSize: 15, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginBottom: 12 }}>No categories yet</p>
                  <button onClick={openNew} style={btnPrimary}>Create your first category</button>
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr key={cat.id} style={{ borderBottom: "1px solid #f5f0e8" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {/* Position arrows */}
                  <td style={{ padding: "10px 8px 10px 16px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button onClick={() => movePosition(cat, -1)} style={{ ...btnGhost, padding: "2px 6px", minHeight: "auto", fontSize: 11 }}>↑</button>
                      <button onClick={() => movePosition(cat, 1)} style={{ ...btnGhost, padding: "2px 6px", minHeight: "auto", fontSize: 11 }}>↓</button>
                    </div>
                  </td>

                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt={cat.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: "1px solid #ede8df", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: "#f0ebe3", border: "1px solid #ede8df", flexShrink: 0 }} />
                      )}
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 500, color: "#3a2e24", fontFamily: "'Inter', sans-serif", margin: 0 }}>{cat.name}</p>
                        <p style={{ fontSize: 11, color: "#b0a090", fontFamily: "'Inter', sans-serif", margin: 0 }}>/{cat.slug}</p>
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif" }}>
                    {cat.parent ? cat.parent.name : <span style={{ color: "#c0b0a0" }}>—</span>}
                  </td>

                  <td style={{ padding: "12px 16px", fontSize: 14, color: "#3a2e24", fontFamily: "'Inter', sans-serif" }}>
                    <span style={{ fontWeight: 500 }}>{cat._count.products}</span>
                  </td>

                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => handleToggleActive(cat)}
                      style={{
                        display: "inline-flex", alignItems: "center",
                        padding: "4px 12px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        fontFamily: "'Inter', sans-serif",
                        background: cat.isActive ? "#dcfce7" : "#f3f4f6",
                        color: cat.isActive ? "#15803d" : "#6b7280",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {cat.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>

                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button
                        onClick={() => openEdit(cat)}
                        style={{ fontSize: 13, color: "#8B6914", fontFamily: "'Inter', sans-serif", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500, padding: 0 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(cat)}
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
      <div className="categories-mobile" style={{ display: "none" }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: 14, marginBottom: 10 }}>
              <div style={{ height: 16, background: "#f0ebe3", borderRadius: 5, width: "60%", marginBottom: 8 }} />
              <div style={{ height: 12, background: "#f0ebe3", borderRadius: 5, width: "40%" }} />
            </div>
          ))
        ) : categories.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: "40px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "#6b5540", fontFamily: "'Inter', sans-serif", marginBottom: 12 }}>No categories yet</p>
            <button onClick={openNew} style={btnPrimary}>Create your first category</button>
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #ede8df", padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {cat.imageUrl && (
                    <img src={cat.imageUrl} alt={cat.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid #ede8df" }} />
                  )}
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter', sans-serif", margin: 0 }}>{cat.name}</p>
                    <p style={{ fontSize: 11, color: "#b0a090", fontFamily: "'Inter', sans-serif", margin: 0 }}>/{cat.slug}</p>
                  </div>
                </div>
                <span style={{
                  display: "inline-block", padding: "3px 10px", borderRadius: 20,
                  fontSize: 11, fontWeight: 500, fontFamily: "'Inter', sans-serif",
                  background: cat.isActive ? "#dcfce7" : "#f3f4f6",
                  color: cat.isActive ? "#15803d" : "#6b7280",
                }}>
                  {cat.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter', sans-serif", marginBottom: 10 }}>
                {cat._count.products} product{cat._count.products !== 1 ? "s" : ""}
                {cat.parent && <> &bull; Parent: {cat.parent.name}</>}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => openEdit(cat)} style={{ fontSize: 13, color: "#8B6914", fontFamily: "'Inter', sans-serif", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500, padding: 0 }}>
                  Edit
                </button>
                <button onClick={() => handleToggleActive(cat)} style={{ fontSize: 13, color: "#6b5540", fontFamily: "'Inter', sans-serif", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                  {cat.isActive ? "Deactivate" : "Activate"}
                </button>
                <button onClick={() => handleDelete(cat)} style={{ fontSize: 13, color: "#b91c1c", fontFamily: "'Inter', sans-serif", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500, padding: 0 }}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        @media (min-width: 768px) {
          .categories-desktop { display: block !important; }
          .categories-mobile { display: none !important; }
        }
        @media (max-width: 767px) {
          .categories-desktop { display: none !important; }
          .categories-mobile { display: block !important; }
        }
      `}</style>
    </div>
  );
}
