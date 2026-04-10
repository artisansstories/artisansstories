"use client";

import { useEffect, useState } from "react";

type AdminRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR";

interface AdminEntry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: AdminRole;
  isActive: boolean;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  EDITOR: "Editor",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 8,
  border: "1.5px solid #e0d5c5",
  background: "#fdfaf6",
  fontSize: 14,
  color: "#3a2e24",
  fontFamily: "'Inter',sans-serif",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

export default function PhoneWhitelistPage() {
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", role: "EDITOR" as AdminRole });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/phone-whitelist");
    if (res.ok) setAdmins(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/phone-whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowAdd(false);
      setForm({ name: "", phone: "", email: "", role: "EDITOR" });
      await load();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to add admin");
    }
    setSaving(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/phone-whitelist/${editId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setEditId(null);
      setForm({ name: "", phone: "", email: "", role: "EDITOR" });
      await load();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to update admin");
    }
    setSaving(false);
  }

  async function toggleActive(admin: AdminEntry) {
    await fetch(`/api/admin/phone-whitelist/${admin.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !admin.isActive }),
    });
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this admin? They will lose access immediately.")) return;
    await fetch(`/api/admin/phone-whitelist/${id}`, { method: "DELETE" });
    await load();
  }

  function startEdit(admin: AdminEntry) {
    setEditId(admin.id);
    setForm({ name: admin.name, phone: admin.phone ?? "", email: admin.email, role: admin.role });
    setShowAdd(false);
    setError("");
  }

  function cancelForm() {
    setShowAdd(false);
    setEditId(null);
    setForm({ name: "", phone: "", email: "", role: "EDITOR" });
    setError("");
  }

  const isFormOpen = showAdd || editId !== null;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(22px,4vw,28px)", fontWeight: 500, color: "#3a2e24", margin: 0 }}>
            Phone Whitelist
          </h1>
          <p style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter',sans-serif", marginTop: 4 }}>
            Manage admin phone numbers authorized for SMS login
          </p>
        </div>
        {!isFormOpen && (
          <button
            onClick={() => { setShowAdd(true); setEditId(null); setError(""); }}
            style={{
              height: 40,
              padding: "0 20px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #8B6914 0%, #c8a84c 100%)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "'Inter',sans-serif",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(139,105,20,0.2)",
            }}
          >
            + Add Admin
          </button>
        )}
      </div>

      {isFormOpen && (
        <div style={{
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #ede8df",
          padding: "20px 24px",
          marginBottom: 20,
        }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 500, color: "#3a2e24", marginBottom: 16 }}>
            {showAdd ? "Add Admin" : "Edit Admin"}
          </h2>
          {error && (
            <div style={{ padding: "8px 12px", borderRadius: 6, background: "#fff5f5", border: "1px solid rgba(220,80,60,0.2)", color: "#c0392b", fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 12 }}>
              {error}
            </div>
          )}
          <form onSubmit={showAdd ? handleAdd : handleEdit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 5 }}>Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Full Name" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 5 }}>Phone *</label>
              <input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required placeholder="+1 (925) 980-6387" type="tel" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 5 }}>Email</label>
              <input style={inputStyle} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="optional@email.com" type="email" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#6b5540", fontFamily: "'Inter',sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 5 }}>Role</label>
              <select style={selectStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AdminRole }))}>
                <option value="EDITOR">Editor</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, marginTop: 4 }}>
              <button type="submit" disabled={saving} style={{ height: 40, padding: "0 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#8B6914,#c8a84c)", color: "#fff", fontSize: 14, fontWeight: 500, fontFamily: "'Inter',sans-serif", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : showAdd ? "Add Admin" : "Save Changes"}
              </button>
              <button type="button" onClick={cancelForm} style={{ height: 40, padding: "0 16px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", color: "#7a5c3a", fontSize: 14, fontFamily: "'Inter',sans-serif", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ede8df", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9a876e", fontFamily: "'Inter',sans-serif", fontSize: 14 }}>Loading…</div>
        ) : admins.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9a876e", fontFamily: "'Inter',sans-serif", fontSize: 14 }}>No admins yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ede8df" }}>
                {["Name", "Phone", "Email", "Role", "Active", ""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9a876e", fontFamily: "'Inter',sans-serif", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {admins.map((admin, i) => (
                <tr key={admin.id} style={{ borderBottom: i < admins.length - 1 ? "1px solid #f0ebe3" : "none" }}>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "#3a2e24", fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>{admin.name}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#5a4a38", fontFamily: "'Inter',sans-serif" }}>{admin.phone ?? "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#5a4a38", fontFamily: "'Inter',sans-serif" }}>{admin.email}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: admin.role === "SUPER_ADMIN" ? "rgba(139,105,20,0.12)" : "rgba(90,74,56,0.08)", color: admin.role === "SUPER_ADMIN" ? "#8B6914" : "#5a4a38", fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>
                      {ROLE_LABELS[admin.role]}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <button
                      onClick={() => toggleActive(admin)}
                      style={{
                        width: 40,
                        height: 22,
                        borderRadius: 11,
                        border: "none",
                        background: admin.isActive ? "#8B6914" : "#d0c8ba",
                        cursor: "pointer",
                        position: "relative",
                        transition: "background 0.2s",
                      }}
                      title={admin.isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
                    >
                      <span style={{
                        position: "absolute",
                        top: 3,
                        left: admin.isActive ? 21 : 3,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 0.2s",
                      }} />
                    </button>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => startEdit(admin)}
                        style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #e0d5c5", background: "transparent", color: "#7a5c3a", fontFamily: "'Inter',sans-serif", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(admin.id)}
                        style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(220,80,60,0.2)", background: "transparent", color: "#c0392b", fontFamily: "'Inter',sans-serif", cursor: "pointer" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
