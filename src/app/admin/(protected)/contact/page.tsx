"use client";

import { useEffect, useState, useCallback } from "react";

type ContactStatus = "UNREAD" | "READ" | "REPLIED" | "ARCHIVED";
type ReplyDirection = "OUTBOUND" | "INBOUND";

interface ContactReply {
  id: string;
  body: string;
  direction: ReplyDirection;
  senderName: string;
  createdAt: string;
}

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactStatus;
  notes: string | null;
  createdAt: string;
  replies: ContactReply[];
}

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d));
}
function fmtTime(d: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(d));
}
function fmtDay(d: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
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

// Group replies + original message into a chronological thread
function buildThread(msg: ContactMessage): { id: string; body: string; direction: ReplyDirection; senderName: string; createdAt: string }[] {
  const original = { id: `orig-${msg.id}`, body: msg.message, direction: "INBOUND" as ReplyDirection, senderName: msg.name, createdAt: msg.createdAt };
  return [original, ...msg.replies].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

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
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState<string | null>(null);

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

  async function handleExpand(msg: ContactMessage) {
    if (expandedId === msg.id) { setExpandedId(null); return; }
    setExpandedId(msg.id);
    if (msg.status === "UNREAD") await updateStatus(msg.id, "READ");
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

  async function sendReply(msg: ContactMessage) {
    const text = replyText[msg.id]?.trim();
    if (!text) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/admin/contact/${msg.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyText: text }),
      });
      if (res.ok) {
        const data = await res.json();
        // Append new reply to thread in local state
        setMessages(prev => prev.map(m => m.id === msg.id
          ? { ...m, status: "REPLIED", replies: [...m.replies, data.reply] }
          : m
        ));
        setReplyingId(null);
        setReplyText(prev => ({ ...prev, [msg.id]: "" }));
        setReplySuccess(msg.id);
        setTimeout(() => setReplySuccess(null), 3000);
      }
    } finally { setSendingReply(false); }
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
          {total} conversation{total !== 1 ? "s" : ""}
          {unreadCount > 0 && <span style={{ marginLeft: 10, padding: "2px 8px", borderRadius: 20, background: "#fffbeb", color: "#d97706", fontSize: 12, fontWeight: 600 }}>{unreadCount} unread</span>}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#fff", border: "1px solid #ede8df", borderRadius: 10, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); setExpandedId(null); }}
            style={{
              padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
              fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
              background: activeTab === tab.key ? "#8B6914" : "transparent",
              color: activeTab === tab.key ? "#fff" : "#5a4a38",
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((msg) => {
              const isExpanded = expandedId === msg.id;
              const thread = buildThread(msg);
              const replyCount = msg.replies.length;

              return (
                <div key={msg.id} style={{ background: "#fff", border: `1px solid ${isExpanded ? "#c9a84c" : "#ede8df"}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}>
                  {/* Header row — always visible */}
                  <div
                    onClick={() => handleExpand(msg)}
                    style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 14,
                      background: msg.status === "UNREAD" ? "#fffef9" : "transparent", transition: "background 0.1s" }}
                    onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                    onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = msg.status === "UNREAD" ? "#fffef9" : "transparent"; }}
                  >
                    {/* Unread dot */}
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: msg.status === "UNREAD" ? "#d97706" : "transparent", flexShrink: 0, marginTop: 4 }} />

                    {/* Avatar */}
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                        {msg.name[0].toUpperCase()}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: msg.status === "UNREAD" ? 700 : 600, color: "#3a2e24" }}>{msg.name}</span>
                        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e" }}>{msg.email}</span>
                        <StatusBadge status={msg.status} />
                      </div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5a4a38", fontWeight: msg.status === "UNREAD" ? 600 : 400 }}>
                        {msg.subject}
                      </div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#b0a090", marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{fmtDate(msg.createdAt)}</span>
                        {replyCount > 0 && (
                          <span style={{ padding: "1px 7px", borderRadius: 10, background: "#f5f0e8", color: "#8a7060", fontSize: 11, fontWeight: 600 }}>
                            {replyCount} {replyCount === 1 ? "reply" : "replies"}
                          </span>
                        )}
                      </div>
                    </div>

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0, marginTop: 4 }}>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>

                  {/* Expanded thread */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #f0ebe1" }}>
                      {/* Thread messages */}
                      <div style={{ padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 12 }}>
                        {thread.map((entry, idx) => {
                          const isOutbound = entry.direction === "OUTBOUND";
                          const prevEntry = idx > 0 ? thread[idx - 1] : null;
                          const showDateDivider = !prevEntry || fmtDay(prevEntry.createdAt) !== fmtDay(entry.createdAt);
                          return (
                            <div key={entry.id}>
                              {showDateDivider && (
                                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
                                  <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
                                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#b0a090", whiteSpace: "nowrap" }}>{fmtDay(entry.createdAt)}</span>
                                  <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
                                </div>
                              )}
                              <div style={{ display: "flex", justifyContent: isOutbound ? "flex-end" : "flex-start", gap: 10 }}>
                                {!isOutbound && (
                                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "flex-end" }}>
                                    <span style={{ color: "#fff", fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{msg.name[0].toUpperCase()}</span>
                                  </div>
                                )}
                                <div style={{ maxWidth: "75%", minWidth: 80 }}>
                                  <div style={{
                                    padding: "10px 14px",
                                    borderRadius: isOutbound ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                                    background: isOutbound ? "linear-gradient(135deg,#8B6914,#C9A84C)" : "#f5f0e8",
                                    color: isOutbound ? "#fff" : "#3a2e24",
                                    fontFamily: "'Inter',sans-serif",
                                    fontSize: 13,
                                    lineHeight: 1.6,
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                  }}>
                                    {entry.body}
                                  </div>
                                  <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#b0a090", marginTop: 3, textAlign: isOutbound ? "right" : "left" }}>
                                    {entry.senderName} · {fmtTime(entry.createdAt)}
                                  </div>
                                </div>
                                {isOutbound && (
                                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#3a2e24", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "flex-end" }}>
                                    <span style={{ color: "#c9a84c", fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>AS</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Reply composer */}
                      <div style={{ padding: "16px 20px" }}>
                        {replyingId === msg.id ? (
                          <div style={{ background: "#f0f9f4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 14px" }}>
                            <textarea
                              value={replyText[msg.id] ?? ""}
                              onChange={e => setReplyText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                              rows={4}
                              placeholder={`Reply to ${msg.name}…`}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #86efac", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#3a2e24", background: "#fff", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                              autoFocus
                            />
                            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                              <button
                                onClick={() => sendReply(msg)}
                                disabled={sendingReply || !replyText[msg.id]?.trim()}
                                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: sendingReply || !replyText[msg.id]?.trim() ? "#c8a84c" : "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, cursor: sendingReply || !replyText[msg.id]?.trim() ? "not-allowed" : "pointer", opacity: sendingReply || !replyText[msg.id]?.trim() ? 0.7 : 1 }}
                              >
                                {sendingReply ? "Sending…" : "Send"}
                              </button>
                              <button
                                onClick={() => setReplyingId(null)}
                                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: "pointer", color: "#5a4a38" }}
                              >
                                Cancel
                              </button>
                              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#6b7280" }}>From hello@artisansstories.com</span>
                            </div>
                            {replySuccess === msg.id && (
                              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#15803d", margin: "6px 0 0", fontWeight: 500 }}>✓ Reply sent</p>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <button
                              onClick={() => setReplyingId(msg.id)}
                              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                            >
                              ✉ Reply
                            </button>
                            {msg.status !== "REPLIED" && (
                              <button onClick={() => updateStatus(msg.id, "REPLIED")} disabled={savingId === msg.id}
                                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ede8df", background: "transparent", color: "#15803d", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                                ✓ Mark Replied
                              </button>
                            )}
                            {msg.status !== "ARCHIVED" && (
                              <button onClick={() => updateStatus(msg.id, "ARCHIVED")} disabled={savingId === msg.id}
                                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ede8df", background: "transparent", color: "#9a876e", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                                Archive
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      <div style={{ padding: "0 20px 20px", borderTop: "1px solid #f5f0e8", paddingTop: 16 }}>
                        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Internal Notes</p>
                        <textarea
                          value={editingNotes[msg.id] ?? msg.notes ?? ""}
                          onChange={e => setEditingNotes(prev => ({ ...prev, [msg.id]: e.target.value }))}
                          rows={2}
                          placeholder="Add internal notes (not visible to customer)…"
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e0d5c5", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#3a2e24", background: "#fefcf9", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                        />
                        {editingNotes[msg.id] !== undefined && editingNotes[msg.id] !== (msg.notes ?? "") && (
                          <button onClick={() => saveNotes(msg.id)} disabled={savingId === msg.id}
                            style={{ marginTop: 6, padding: "6px 14px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
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
