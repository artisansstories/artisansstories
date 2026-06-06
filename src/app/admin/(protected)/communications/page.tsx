"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

/* ─── Types ─── */
type ContactStatus = "UNREAD" | "READ" | "REPLIED" | "ARCHIVED";
type ReplyDirection = "OUTBOUND" | "INBOUND";

interface ContactReply { id: string; body: string; direction: ReplyDirection; senderName: string; createdAt: string; }
interface ContactMessage {
  id: string; name: string; email: string; subject: string; message: string;
  status: ContactStatus; createdAt: string; replies: ContactReply[];
}

type EmailLogType = "ORDER_CONFIRMATION"|"ORDER_SHIPPED"|"MAGIC_LINK_CUSTOMER"|"MAGIC_LINK_ADMIN"|"CONTACT_INBOUND"|"CONTACT_REPLY"|"RETURN_REQUEST"|"RETURN_APPROVED"|"RETURN_REJECTED"|"REFUND_ISSUED"|"SUBSCRIBE_WELCOME"|"SYSTEM";

interface EmailLog {
  id: string; type: EmailLogType; direction: "OUTBOUND"|"INBOUND";
  toEmail: string; fromEmail: string; subject: string;
  resendId: string | null; relatedId: string | null; relatedType: string | null; createdAt: string;
}

/* ─── Helpers ─── */
function fmtDate(d: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d)); }
function fmtDay(d: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d)); }
function fmtTime(d: string) { return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(d)); }

const STATUS_CONFIG: Record<ContactStatus, { bg: string; color: string; label: string }> = {
  UNREAD:   { bg: "#fffbeb", color: "#d97706", label: "Unread" },
  READ:     { bg: "#eff6ff", color: "#2563eb", label: "Read" },
  REPLIED:  { bg: "#dcfce7", color: "#15803d", label: "Replied" },
  ARCHIVED: { bg: "#f5f0e8", color: "#9a876e", label: "Archived" },
};

const LOG_TYPE_CONFIG: Record<EmailLogType, { label: string; color: string; bg: string }> = {
  ORDER_CONFIRMATION:  { label: "Order Confirmation",  color: "#15803d", bg: "#dcfce7" },
  ORDER_SHIPPED:       { label: "Order Shipped",        color: "#0284c7", bg: "#f0f9ff" },
  MAGIC_LINK_CUSTOMER: { label: "Sign-in Link",         color: "#7c3aed", bg: "#f5f3ff" },
  MAGIC_LINK_ADMIN:    { label: "Admin Sign-in",        color: "#9a3412", bg: "#fff7ed" },
  CONTACT_INBOUND:     { label: "Contact Form",         color: "#d97706", bg: "#fffbeb" },
  CONTACT_REPLY:       { label: "Contact Reply",        color: "#8B6914", bg: "#fdf5e4" },
  RETURN_REQUEST:      { label: "Return Request",       color: "#b45309", bg: "#fffbeb" },
  RETURN_APPROVED:     { label: "Return Approved",      color: "#15803d", bg: "#dcfce7" },
  RETURN_REJECTED:     { label: "Return Rejected",      color: "#dc2626", bg: "#fef2f2" },
  REFUND_ISSUED:       { label: "Refund Issued",        color: "#6b21a8", bg: "#faf5ff" },
  SUBSCRIBE_WELCOME:   { label: "Welcome Email",        color: "#0891b2", bg: "#ecfeff" },
  SYSTEM:              { label: "System",               color: "#6b7280", bg: "#f9fafb" },
};

function StatusBadge({ status }: { status: ContactStatus }) {
  const s = STATUS_CONFIG[status];
  return <span style={{ padding: "3px 9px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>{s.label}</span>;
}

function TypeBadge({ type, direction }: { type: EmailLogType; direction: "OUTBOUND"|"INBOUND" }) {
  const s = LOG_TYPE_CONFIG[type] ?? { label: type, color: "#6b7280", bg: "#f9fafb" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ padding: "3px 9px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>{s.label}</span>
      <span style={{ padding: "2px 7px", borderRadius: 20, background: direction === "INBOUND" ? "#eff6ff" : "#f0fdf4", color: direction === "INBOUND" ? "#2563eb" : "#15803d", fontSize: 10, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
        {direction === "INBOUND" ? "↓ IN" : "↑ OUT"}
      </span>
    </div>
  );
}

const CONV_TABS = [
  { key: "ALL", label: "All" }, { key: "UNREAD", label: "Unread" },
  { key: "READ", label: "Read" }, { key: "REPLIED", label: "Replied" }, { key: "ARCHIVED", label: "Archived" },
];

const LOG_TYPES = [
  "ALL", "ORDER_CONFIRMATION", "ORDER_SHIPPED", "MAGIC_LINK_CUSTOMER",
  "CONTACT_INBOUND", "CONTACT_REPLY", "RETURN_REQUEST", "RETURN_APPROVED",
  "RETURN_REJECTED", "REFUND_ISSUED",
];

function buildThread(msg: ContactMessage) {
  const orig = { id: `orig-${msg.id}`, body: msg.message, direction: "INBOUND" as ReplyDirection, senderName: msg.name, createdAt: msg.createdAt };
  return [orig, ...msg.replies].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/* ─── Main ─── */
export default function CommunicationsPage() {
  const [mainTab, setMainTab] = useState<"conversations"|"log">("conversations");

  // Conversations state
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [msgPages, setMsgPages] = useState(1);
  const [msgPage, setMsgPage] = useState(1);
  const [convStatus, setConvStatus] = useState("ALL");
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState<string | null>(null);

  // Log state
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPages, setLogPages] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [logType, setLogType] = useState("ALL");

  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (mainTab === "conversations") {
        const params = new URLSearchParams({ tab: "conversations", page: String(msgPage), ...(convStatus !== "ALL" && { status: convStatus }) });
        const res = await fetch(`/api/admin/communications?${params}`);
        const data = await res.json();
        setMessages(data.messages ?? []); setMsgTotal(data.total ?? 0); setMsgPages(data.pages ?? 1); setUnreadCount(data.unreadCount ?? 0);
      } else {
        const params = new URLSearchParams({ tab: "log", page: String(logPage), ...(logType !== "ALL" && { type: logType }) });
        const res = await fetch(`/api/admin/communications?${params}`);
        const data = await res.json();
        setLogs(data.logs ?? []); setLogTotal(data.total ?? 0); setLogPages(data.pages ?? 1);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [mainTab, msgPage, convStatus, logPage, logType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function updateStatus(id: string, status: ContactStatus) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/contact/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
        if (status === "READ") setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } finally { setSavingId(null); }
  }

  async function handleExpand(msg: ContactMessage) {
    if (expandedId === msg.id) { setExpandedId(null); return; }
    setExpandedId(msg.id);
    if (msg.status === "UNREAD") await updateStatus(msg.id, "READ");
  }

  async function sendReply(msg: ContactMessage) {
    const text = replyText[msg.id]?.trim();
    if (!text) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/admin/contact/${msg.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replyText: text }) });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: "REPLIED", replies: [...m.replies, data.reply] } : m));
        setReplyingId(null); setReplyText(prev => ({ ...prev, [msg.id]: "" }));
        setReplySuccess(msg.id); setTimeout(() => setReplySuccess(null), 3000);
      }
    } finally { setSendingReply(false); }
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 600, color: "#3a2e24", margin: "0 0 4px" }}>Communications</h1>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>
          All inbound and outbound email activity
        </p>
      </div>

      {/* Main tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid #ede8df" }}>
        {[
          { key: "conversations", label: "Conversations", badge: unreadCount > 0 ? unreadCount : null },
          { key: "log", label: "Email Log" },
        ].map(t => (
          <button key={t.key}
            onClick={() => { setMainTab(t.key as "conversations"|"log"); setExpandedId(null); }}
            style={{ padding: "10px 20px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: mainTab === t.key ? 600 : 400, color: mainTab === t.key ? "#8B6914" : "#5a4a38", borderBottom: mainTab === t.key ? "2px solid #8B6914" : "2px solid transparent", marginBottom: -2, display: "flex", alignItems: "center", gap: 6, transition: "color 0.15s" }}
          >
            {t.label}
            {t.badge && <span style={{ padding: "1px 7px", borderRadius: 10, background: "#d97706", color: "#fff", fontSize: 10, fontWeight: 700 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── CONVERSATIONS TAB ── */}
      {mainTab === "conversations" && (
        <>
          {/* Status filter pills */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {CONV_TABS.map(tab => (
              <button key={tab.key}
                onClick={() => { setConvStatus(tab.key); setMsgPage(1); setExpandedId(null); }}
                style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${convStatus === tab.key ? "#8B6914" : "#ede8df"}`, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: convStatus === tab.key ? 600 : 400, background: convStatus === tab.key ? "#8B6914" : "#fff", color: convStatus === tab.key ? "#fff" : "#5a4a38", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5 }}
              >
                {tab.label}
                {tab.key === "UNREAD" && unreadCount > 0 && (
                  <span style={{ padding: "0 5px", borderRadius: 8, background: convStatus === "UNREAD" ? "rgba(255,255,255,0.3)" : "#d97706", color: "#fff", fontSize: 9, fontWeight: 700 }}>{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          {loading ? <Spinner /> : messages.length === 0 ? (
            <Empty text={convStatus === "ALL" ? "No conversations yet" : `No ${convStatus.toLowerCase()} conversations`} />
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.map(msg => {
                  const isExpanded = expandedId === msg.id;
                  const thread = buildThread(msg);
                  const replyCount = msg.replies.length;
                  return (
                    <div key={msg.id} style={{ background: "#fff", border: `1px solid ${isExpanded ? "#c9a84c" : "#ede8df"}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}>
                      {/* Header */}
                      <div onClick={() => handleExpand(msg)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, background: msg.status === "UNREAD" ? "#fffef9" : "transparent" }}
                        onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                        onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = msg.status === "UNREAD" ? "#fffef9" : "transparent"; }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: msg.status === "UNREAD" ? "#d97706" : "transparent", flexShrink: 0, marginTop: 6 }} />
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>{msg.name[0].toUpperCase()}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: msg.status === "UNREAD" ? 700 : 600, color: "#3a2e24" }}>{msg.name}</span>
                            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e" }}>{msg.email}</span>
                            <StatusBadge status={msg.status} />
                          </div>
                          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5a4a38", fontWeight: msg.status === "UNREAD" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.subject}</div>
                          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#b0a090", marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                            <span>{fmtDate(msg.createdAt)}</span>
                            {replyCount > 0 && <span style={{ padding: "1px 6px", borderRadius: 8, background: "#f5f0e8", color: "#8a7060", fontSize: 10, fontWeight: 600 }}>{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>}
                          </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0, marginTop: 4 }}>
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>

                      {/* Thread */}
                      {isExpanded && (
                        <div style={{ borderTop: "1px solid #f0ebe1" }}>
                          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                            {thread.map((entry, idx) => {
                              const isOut = entry.direction === "OUTBOUND";
                              const prev = idx > 0 ? thread[idx - 1] : null;
                              const showDiv = !prev || fmtDay(prev.createdAt) !== fmtDay(entry.createdAt);
                              return (
                                <div key={entry.id}>
                                  {showDiv && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 8px" }}>
                                      <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
                                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#b0a090" }}>{fmtDay(entry.createdAt)}</span>
                                      <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
                                    </div>
                                  )}
                                  <div style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-end" }}>
                                    {!isOut && <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{msg.name[0].toUpperCase()}</span></div>}
                                    <div style={{ maxWidth: "70%" }}>
                                      <div style={{ padding: "9px 13px", borderRadius: isOut ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isOut ? "linear-gradient(135deg,#8B6914,#C9A84C)" : "#f5f0e8", color: isOut ? "#fff" : "#3a2e24", fontFamily: "'Inter',sans-serif", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                        {entry.body}
                                      </div>
                                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#b0a090", marginTop: 2, textAlign: isOut ? "right" : "left" }}>{entry.senderName} · {fmtTime(entry.createdAt)}</div>
                                    </div>
                                    {isOut && <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#3a2e24", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ color: "#c9a84c", fontSize: 10, fontWeight: 700 }}>AS</span></div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Reply composer / actions */}
                          <div style={{ padding: "0 18px 14px" }}>
                            {replyingId === msg.id ? (
                              <div style={{ background: "#f0f9f4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                                <textarea value={replyText[msg.id] ?? ""} onChange={e => setReplyText(prev => ({ ...prev, [msg.id]: e.target.value }))} rows={4}
                                  placeholder={`Reply to ${msg.name}…`} autoFocus
                                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #86efac", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#3a2e24", background: "#fff", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                                  <button onClick={() => sendReply(msg)} disabled={sendingReply || !replyText[msg.id]?.trim()}
                                    style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: sendingReply || !replyText[msg.id]?.trim() ? "#c8a84c" : "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: sendingReply || !replyText[msg.id]?.trim() ? 0.7 : 1 }}>
                                    {sendingReply ? "Sending…" : "Send"}
                                  </button>
                                  <button onClick={() => setReplyingId(null)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: "pointer", color: "#5a4a38" }}>Cancel</button>
                                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#9a876e" }}>From hello@artisansstories.com</span>
                                </div>
                                {replySuccess === msg.id && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#15803d", margin: "6px 0 0", fontWeight: 500 }}>✓ Sent</p>}
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button onClick={() => setReplyingId(msg.id)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✉ Reply</button>
                                {msg.status !== "REPLIED" && <button onClick={() => updateStatus(msg.id, "REPLIED")} disabled={savingId === msg.id} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #ede8df", background: "transparent", color: "#15803d", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>✓ Mark Replied</button>}
                                {msg.status !== "ARCHIVED" && <button onClick={() => updateStatus(msg.id, "ARCHIVED")} disabled={savingId === msg.id} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #ede8df", background: "transparent", color: "#9a876e", fontFamily: "'Inter',sans-serif", fontSize: 12, cursor: "pointer" }}>Archive</button>}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Pagination page={msgPage} pages={msgPages} onPage={setMsgPage} />
            </>
          )}
        </>
      )}

      {/* ── EMAIL LOG TAB ── */}
      {mainTab === "log" && (
        <>
          {/* Type filter */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {LOG_TYPES.map(t => (
              <button key={t}
                onClick={() => { setLogType(t); setLogPage(1); }}
                style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${logType === t ? "#8B6914" : "#ede8df"}`, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: logType === t ? 600 : 400, background: logType === t ? "#8B6914" : "#fff", color: logType === t ? "#fff" : "#5a4a38", transition: "all 0.15s" }}
              >
                {t === "ALL" ? "All" : (LOG_TYPE_CONFIG[t as EmailLogType]?.label ?? t)}
              </button>
            ))}
          </div>

          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e", marginBottom: 10 }}>{logTotal} email{logTotal !== 1 ? "s" : ""}</div>

          {loading ? <Spinner /> : logs.length === 0 ? <Empty text="No email logs yet" /> : (
            <>
              <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ede8df" }}>
                      {["Type", "To / From", "Subject", "Related", "Date", ""].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, idx) => (
                      <tr key={log.id} style={{ borderBottom: idx < logs.length - 1 ? "1px solid #f5f0e8" : "none" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <td style={{ padding: "11px 14px" }}><TypeBadge type={log.type} direction={log.direction} /></td>
                        <td style={{ padding: "11px 14px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#3a2e24" }}>
                          <div>{log.direction === "OUTBOUND" ? `→ ${log.toEmail}` : `← ${log.fromEmail}`}</div>
                        </td>
                        <td style={{ padding: "11px 14px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#5a4a38", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.subject}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#9a876e" }}>
                          {log.relatedType && log.relatedId ? (
                            log.relatedType === "ORDER" ? (
                              <Link href={`/admin/orders/${log.relatedId}`} style={{ color: "#8B6914", textDecoration: "none", fontWeight: 500 }}>Order →</Link>
                            ) : log.relatedType === "RETURN" ? (
                              <Link href={`/admin/returns/${log.relatedId}`} style={{ color: "#8B6914", textDecoration: "none", fontWeight: 500 }}>Return →</Link>
                            ) : log.relatedType === "CONTACT" ? (
                              <button onClick={() => setMainTab("conversations")} style={{ background: "none", border: "none", cursor: "pointer", color: "#8B6914", fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500, padding: 0 }}>Thread →</button>
                            ) : <span style={{ color: "#b0a090" }}>{log.relatedType}</span>
                          ) : <span style={{ color: "#d0c8bc" }}>—</span>}
                        </td>
                        <td style={{ padding: "11px 14px", fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#9a876e", whiteSpace: "nowrap" }}>{fmtDate(log.createdAt)}</td>
                        <td style={{ padding: "11px 14px" }}>
                          <Link href={`/admin/communications/email/${log.id}`}
                            style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#8B6914", fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={logPage} pages={logPages} onPage={setLogPage} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <div style={{ width: 28, height: 28, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "40px 20px", textAlign: "center" }}>
      <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: "#9a876e", margin: 0 }}>{text}</p>
    </div>
  );
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}
        style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1, color: "#5a4a38" }}>Prev</button>
      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e" }}>Page {page} of {pages}</span>
      <button onClick={() => onPage(Math.min(pages, page + 1))} disabled={page === pages}
        style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: page === pages ? "not-allowed" : "pointer", opacity: page === pages ? 0.5 : 1, color: "#5a4a38" }}>Next</button>
    </div>
  );
}
