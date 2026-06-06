"use client";

import { useEffect, useState, useCallback } from "react";

type ContactStatus = "UNREAD" | "READ" | "REPLIED" | "ARCHIVED";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactStatus;
  notes: string | null;
  createdAt: string;
}

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d));
}

const STATUS_CONFIG: Record<ContactStatus, { bg: string; color: string; label: string }> = {
  UNREAD:   { bg: "#fffbeb", color: "#d97706", label: "Unread" },
  READ:     { bg: "#eff6ff", color: "#2563eb", label: "Read" },
  REPLIED:  { bg: "#dcfce7", color: "#15803d", label: "Replied" },
  ARCHIVED: { bg: "#f5f0e8", color: "#9a876e", label: "Archived" },
};

function StatusBadge({ status }: { status: ContactStatus }) {
  const s = STATUS_CONFIG[status];
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

const TABS: { key: string; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "UNREAD", label: "Unread" },
  { key: "READ", label: "Read" },
  { key: "REPLIED", label: "Replied" },
  { key: "ARCHIVED", label: "Archived" },
];

export default function ContactInboxPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", ...(activeTab !== "ALL" && { status: activeTab }) });
      const res = await fetch(`/api/admin/contact?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setMessages(data.messages);
      setTotal(data.total);
      setPages(data.pages);
      setUnreadCount(data.unreadCount);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, activeTab]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Auto-mark as READ when expanded
  async function handleExpand(msg: ContactMessage) {
    if (expandedId === msg.id) { setExpandedId(null); return; }
    setExpandedId(msg.id);
    if (msg.status === "UNREAD") {
      await updateStatus(msg.id, "READ");
    }
  }

  async function updateStatus(id: string, status: ContactStatus) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/contact/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
        if (status === "READ") setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } finally { setSavingId(null); }
  }

  async function saveNotes(id: string) {
    const notes = editingNotes[id] ?? "";
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/contact/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, notes } : m));
      }
    } finally { setSavingId(null); }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 600, color: "#3a2e24", margin: "0 0 4px" }}>
          Contact Inbox
        </h1>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>
          {total} message{total !== 1 ? "s" : ""}
          {unreadCount > 0 && <span style={{ marginLeft: 10, padding: "2px 8px", borderRadius: 20, background: "#fffbeb", color: "#d97706", fontSize: 12, fontWeight: 600 }}>{unreadCount} unread</span>}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#fff", border: "1px solid #ede8df", borderRadius: 10, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); setExpandedId(null); }}
            style={{
              padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
              fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
              background: activeTab === tab.key ? "#8B6914" : "transparent",
              color: activeTab === tab.key ? "#fff" : "#5a4a38",
              transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {tab.label}
            {tab.key === "UNREAD" && unreadCount > 0 && (
              <span style={{ padding: "1px 6px", borderRadius: 10, background: activeTab === "UNREAD" ? "rgba(255,255,255,0.3)" : "#d97706", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : messages.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#9a876e", margin: 0 }}>
            {activeTab === "ALL" ? "No messages yet" : `No ${activeTab.toLowerCase()} messages`}
          </p>
        </div>
      ) : (
        <>
          <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden" }}>
            {messages.map((msg, idx) => {
              const isExpanded = expandedId === msg.id;
              return (
                <div key={msg.id} style={{ borderBottom: idx < messages.length - 1 ? "1px solid #f5f0e8" : "none" }}>
                  {/* Row */}
                  <div
                    onClick={() => handleExpand(msg)}
                    style={{
                      padding: "14px 20px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      background: isExpanded ? "#faf7f2" : msg.status === "UNREAD" ? "#fffef9" : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                    onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = msg.status === "UNREAD" ? "#fffef9" : "transparent"; }}
                  >
                    {/* Unread dot */}
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: msg.status === "UNREAD" ? "#d97706" : "transparent", flexShrink: 0 }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 2 }}>
                        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: msg.status === "UNREAD" ? 700 : 500, color: "#3a2e24" }}>
                          {msg.name}
                        </span>
                        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e" }}>{msg.email}</span>
                      </div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5a4a38", fontWeight: msg.status === "UNREAD" ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60vw" }}>
                        {msg.subject}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <StatusBadge status={msg.status} />
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e", whiteSpace: "nowrap" }}>{fmtDate(msg.createdAt)}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "0 20px 20px 42px", borderTop: "1px solid #f5f0e8" }}>
                      {/* Message body */}
                      <div style={{ background: "#faf7f2", borderRadius: 10, padding: "14px 16px", margin: "16px 0", fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#3a2e24", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                        {msg.message}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                        <a
                          href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject)}`}
                          onClick={() => updateStatus(msg.id, "REPLIED")}
                          style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          ✉ Reply via Email
                        </a>
                        {msg.status !== "REPLIED" && (
                          <button
                            onClick={() => updateStatus(msg.id, "REPLIED")}
                            disabled={savingId === msg.id}
                            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ede8df", background: "transparent", color: "#15803d", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                          >
                            ✓ Mark Replied
                          </button>
                        )}
                        {msg.status !== "READ" && msg.status !== "REPLIED" && (
                          <button
                            onClick={() => updateStatus(msg.id, "READ")}
                            disabled={savingId === msg.id}
                            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ede8df", background: "transparent", color: "#2563eb", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                          >
                            Mark Read
                          </button>
                        )}
                        {msg.status !== "ARCHIVED" && (
                          <button
                            onClick={() => updateStatus(msg.id, "ARCHIVED")}
                            disabled={savingId === msg.id}
                            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ede8df", background: "transparent", color: "#9a876e", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                          >
                            Archive
                          </button>
                        )}
                      </div>

                      {/* Notes */}
                      <div>
                        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Notes</p>
                        <textarea
                          value={editingNotes[msg.id] ?? msg.notes ?? ""}
                          onChange={e => setEditingNotes(prev => ({ ...prev, [msg.id]: e.target.value }))}
                          rows={2}
                          placeholder="Add internal notes…"
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e0d5c5", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#3a2e24", background: "#fefcf9", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                        />
                        {editingNotes[msg.id] !== undefined && editingNotes[msg.id] !== (msg.notes ?? "") && (
                          <button
                            onClick={() => saveNotes(msg.id)}
                            disabled={savingId === msg.id}
                            style={{ marginTop: 6, padding: "6px 14px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                          >
                            {savingId === msg.id ? "Saving…" : "Save Notes"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 14, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1, color: "#5a4a38" }}>
                Previous
              </button>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e" }}>Page {page} of {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
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
