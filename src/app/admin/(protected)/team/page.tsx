"use client";

import { useState, useEffect, useCallback } from "react";

interface AdminMember {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "EDITOR";
  isActive: boolean;
  createdAt: string;
}

const ROLE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  SUPER_ADMIN: { bg: "rgba(139,105,20,0.12)", color: "#8B6914", label: "Super Admin" },
  ADMIN: { bg: "rgba(180,120,20,0.12)", color: "#b47814", label: "Admin" },
  EDITOR: { bg: "rgba(120,120,120,0.1)", color: "#6b6b6b", label: "Editor" },
};

// ─── Modals ───────────────────────────────────────────────────────────────────

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0",
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "#fff",
        borderRadius: "20px 20px 0 0",
        padding: "clamp(24px,5vw,36px) clamp(20px,5vw,32px)",
        maxHeight: "90dvh",
        overflowY: "auto",
      }}
        className="team-modal"
      >
        {children}
      </div>
      <style>{`
        @media (min-width: 600px) {
          .team-modal {
            border-radius: 20px !important;
            margin: auto !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EDITOR");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%", height: 44, padding: "0 14px",
    borderRadius: 10, border: "1.5px solid #e0d5c5",
    background: "#fdfaf6", fontSize: 14, color: "#3a2e24",
    fontFamily: "'Inter',sans-serif", outline: "none",
  };

  const labelStyle = {
    display: "block" as const, fontSize: 11, fontWeight: 600 as const,
    color: "#6b5540", fontFamily: "'Inter',sans-serif",
    letterSpacing: "0.05em", marginBottom: 6, textTransform: "uppercase" as const,
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 500, color: "#3a2e24", margin: 0 }}>
          Invite Admin
        </h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9a876e", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff5f5", border: "1px solid rgba(220,80,60,0.2)", color: "#c0392b", fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Full Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" required style={inputStyle}
            onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
            onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@artisansstories.com" required style={inputStyle}
            onFocus={e => { e.target.style.borderColor = "#8B6914"; }}
            onBlur={e => { e.target.style.borderColor = "#e0d5c5"; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={{ ...inputStyle, appearance: "none" }}
            onFocus={e => { (e.target as HTMLElement).style.borderColor = "#8B6914"; }}
            onBlur={e => { (e.target as HTMLElement).style.borderColor = "#e0d5c5"; }}
          >
            <option value="EDITOR">Editor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%", height: 48, borderRadius: 12, border: "none",
            background: loading ? "#c8a84c" : "linear-gradient(135deg, #8B6914 0%, #c8a84c 100%)",
            color: "#fff", fontSize: 14, fontWeight: 600, letterSpacing: "0.04em",
            fontFamily: "'Inter',sans-serif", cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.75 : 1, marginTop: 4,
            boxShadow: "0 4px 16px rgba(139,105,20,0.2)",
          }}
        >
          {loading ? "Sending Invite…" : "Send Invite"}
        </button>
      </form>
    </>
  );
}

// ─── Edit Role Modal ──────────────────────────────────────────────────────────

function EditRoleModal({ member, onClose, onSuccess }: { member: AdminMember; onClose: () => void; onSuccess: () => void }) {
  const [role, setRole] = useState(member.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 500, color: "#3a2e24", margin: 0 }}>
          Edit Role
        </h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9a876e", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
      </div>
      <p style={{ fontSize: 13, color: "#9a876e", fontFamily: "'Inter',sans-serif", marginBottom: 20 }}>
        Changing role for <strong style={{ color: "#3a2e24" }}>{member.name}</strong>
      </p>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff5f5", border: "1px solid rgba(220,80,60,0.2)", color: "#c0392b", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <select value={role} onChange={e => setRole(e.target.value as AdminMember["role"])} style={{
          width: "100%", height: 44, padding: "0 14px",
          borderRadius: 10, border: "1.5px solid #e0d5c5",
          background: "#fdfaf6", fontSize: 14, color: "#3a2e24",
          fontFamily: "'Inter',sans-serif", outline: "none",
        }}>
          <option value="EDITOR">Editor</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit" disabled={loading} style={{
          height: 48, borderRadius: 12, border: "none",
          background: "linear-gradient(135deg, #8B6914 0%, #c8a84c 100%)",
          color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "'Inter',sans-serif",
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.75 : 1,
          boxShadow: "0 4px 16px rgba(139,105,20,0.2)",
        }}>
          {loading ? "Saving…" : "Save Role"}
        </button>
      </form>
    </>
  );
}

// ─── Remove Confirm Modal ─────────────────────────────────────────────────────

function RemoveModal({ member, onClose, onSuccess }: { member: AdminMember; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRemove() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 500, color: "#3a2e24", margin: 0 }}>
          Remove Admin
        </h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9a876e", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
      </div>
      <p style={{ fontSize: 14, color: "#5a4a38", fontFamily: "'Inter',sans-serif", lineHeight: 1.6, marginBottom: 24 }}>
        Remove <strong>{member.name}</strong> from the admin team? They will immediately lose all access.
      </p>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff5f5", border: "1px solid rgba(220,80,60,0.2)", color: "#c0392b", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={{
          flex: 1, height: 44, borderRadius: 10, border: "1.5px solid #e0d5c5",
          background: "transparent", color: "#6b5540", fontSize: 14, fontFamily: "'Inter',sans-serif", cursor: "pointer",
        }}>
          Cancel
        </button>
        <button onClick={handleRemove} disabled={loading} style={{
          flex: 1, height: 44, borderRadius: 10, border: "none",
          background: loading ? "#e07060" : "#c0392b",
          color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "'Inter',sans-serif",
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.75 : 1,
        }}>
          {loading ? "Removing…" : "Remove"}
        </button>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [modal, setModal] = useState<
    | { type: "invite" }
    | { type: "edit"; member: AdminMember }
    | { type: "remove"; member: AdminMember }
    | null
  >(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/team");
      const data = await res.json();
      setMembers(data.admins ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
    // Get current user from session cookie (decoded via API)
    fetch("/api/auth/admin/session")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.session) {
          setCurrentUserId(data.session.id);
          setCurrentUserRole(data.session.role);
        }
      })
      .catch(() => {});
  }, [loadTeam]);

  async function toggleActive(member: AdminMember) {
    try {
      await fetch(`/api/admin/team/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !member.isActive }),
      });
      await loadTeam();
    } catch {
      // silent
    }
  }

  const canManage = currentUserRole === "SUPER_ADMIN" || currentUserRole === "ADMIN";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Inter:wght@300;400;500;600&display=swap');
      `}</style>

      <div style={{ maxWidth: 760 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(24px,4vw,32px)", fontWeight: 500, color: "#3a2e24", marginBottom: 4 }}>
              Team
            </h1>
            <p style={{ fontSize: 14, color: "#9a876e", fontFamily: "'Inter',sans-serif" }}>
              Manage admin access to your store.
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => setModal({ type: "invite" })}
              style={{
                height: 40, padding: "0 20px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #8B6914 0%, #c8a84c 100%)",
                color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif",
                cursor: "pointer", boxShadow: "0 4px 12px rgba(139,105,20,0.2)",
                whiteSpace: "nowrap",
              }}
            >
              + Invite Admin
            </button>
          )}
        </div>

        {/* Members list */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {members.map(member => {
              const roleInfo = ROLE_COLORS[member.role] ?? ROLE_COLORS.EDITOR;
              const isCurrentUser = member.id === currentUserId;

              return (
                <div
                  key={member.id}
                  style={{
                    background: "#fff",
                    borderRadius: 14,
                    border: "1px solid #ede8df",
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    opacity: member.isActive ? 1 : 0.6,
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "linear-gradient(135deg,#8B6914,#C9A84C)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <span style={{ color: "#fff", fontSize: 15, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                      {member.name[0]?.toUpperCase() ?? "?"}
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#3a2e24", fontFamily: "'Inter',sans-serif" }}>
                        {member.name}
                      </span>
                      {isCurrentUser && (
                        <span style={{ fontSize: 11, color: "#9a876e", fontFamily: "'Inter',sans-serif" }}>(You)</span>
                      )}
                      <span style={{
                        fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif",
                        padding: "2px 8px", borderRadius: 20,
                        background: roleInfo.bg, color: roleInfo.color,
                        letterSpacing: "0.02em",
                      }}>
                        {roleInfo.label}
                      </span>
                      <span style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 11, fontFamily: "'Inter',sans-serif",
                        color: member.isActive ? "#4a9a4a" : "#999",
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: member.isActive ? "#4a9a4a" : "#bbb",
                          display: "inline-block",
                        }} />
                        {member.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "#9a876e", fontFamily: "'Inter',sans-serif", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {member.email}
                    </p>
                  </div>

                  {/* Actions */}
                  {canManage && !isCurrentUser && (
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <button
                        onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                        style={{
                          width: 32, height: 32, borderRadius: 8, border: "1.5px solid #e0d5c5",
                          background: "transparent", cursor: "pointer", color: "#9a876e",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, fontWeight: 600,
                        }}
                      >
                        ···
                      </button>
                      {openMenuId === member.id && (
                        <div style={{
                          position: "absolute", right: 0, top: 38, zIndex: 20,
                          background: "#fff", borderRadius: 10,
                          border: "1px solid #ede8df",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                          minWidth: 160, overflow: "hidden",
                        }}>
                          {member.role !== "SUPER_ADMIN" && (
                            <button
                              onClick={() => { setModal({ type: "edit", member }); setOpenMenuId(null); }}
                              style={{ display: "block", width: "100%", padding: "11px 16px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "#3a2e24", fontFamily: "'Inter',sans-serif", cursor: "pointer" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                            >
                              Edit Role
                            </button>
                          )}
                          <button
                            onClick={() => { toggleActive(member); setOpenMenuId(null); }}
                            style={{ display: "block", width: "100%", padding: "11px 16px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "#3a2e24", fontFamily: "'Inter',sans-serif", cursor: "pointer" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                          >
                            {member.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                          {currentUserRole === "SUPER_ADMIN" && (
                            <button
                              onClick={() => { setModal({ type: "remove", member }); setOpenMenuId(null); }}
                              style={{ display: "block", width: "100%", padding: "11px 16px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "#c0392b", fontFamily: "'Inter',sans-serif", cursor: "pointer" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#fff5f5"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Click outside to close menu */}
      {openMenuId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setOpenMenuId(null)} />
      )}

      {/* Modals */}
      {modal?.type === "invite" && (
        <Modal onClose={() => setModal(null)}>
          <InviteModal onClose={() => setModal(null)} onSuccess={loadTeam} />
        </Modal>
      )}
      {modal?.type === "edit" && (
        <Modal onClose={() => setModal(null)}>
          <EditRoleModal member={modal.member} onClose={() => setModal(null)} onSuccess={loadTeam} />
        </Modal>
      )}
      {modal?.type === "remove" && (
        <Modal onClose={() => setModal(null)}>
          <RemoveModal member={modal.member} onClose={() => setModal(null)} onSuccess={loadTeam} />
        </Modal>
      )}
    </>
  );
}
