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

type EmailLogType = "ORDER_CONFIRMATION" | "ORDER_SHIPPED" | "MAGIC_LINK_CUSTOMER" | "MAGIC_LINK_ADMIN" |
  "CONTACT_INBOUND" | "CONTACT_REPLY" | "RETURN_REQUEST" | "RETURN_APPROVED" | "RETURN_REJECTED" |
  "REFUND_ISSUED" | "SUBSCRIBE_WELCOME" | "SYSTEM";

interface EmailLog {
  id: string; type: EmailLogType; direction: "OUTBOUND" | "INBOUND";
  toEmail: string; fromEmail: string; subject: string; bodyHtml: string | null;
  resendId: string | null; relatedId: string | null; relatedType: string | null; createdAt: string;
}

type FeedItem =
  | { kind: "conversation"; createdAt: string; data: ContactMessage }
  | { kind: "email"; createdAt: string; data: EmailLog };

/* ─── Helpers ─── */
function fmtDate(d: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d));
}
function fmtDay(d: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
}
function fmtTime(d: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(d));
}
function isSameDay(a: string, b: string) { return fmtDay(a) === fmtDay(b); }

const CONV_STATUS: Record<ContactStatus, { bg: string; color: string; label: string }> = {
  UNREAD:   { bg: "#fffbeb", color: "#d97706", label: "Unread" },
  READ:     { bg: "#eff6ff", color: "#2563eb", label: "Read" },
  REPLIED:  { bg: "#dcfce7", color: "#15803d", label: "Replied" },
  ARCHIVED: { bg: "#f5f0e8", color: "#9a876e", label: "Archived" },
};

const EMAIL_TYPE: Record<string, { label: string; color: string; bg: string }> = {
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
  const s = CONV_STATUS[status];
  return <span style={{ padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>{s.label}</span>;
}

function TypeBadge({ type, direction }: { type: string; direction?: "OUTBOUND" | "INBOUND" }) {
  const s = EMAIL_TYPE[type] ?? { label: type, color: "#6b7280", bg: "#f9fafb" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>{s.label}</span>
      {direction && <span style={{ padding: "1px 6px", borderRadius: 10, background: direction === "INBOUND" ? "#eff6ff" : "#f0fdf4", color: direction === "INBOUND" ? "#2563eb" : "#15803d", fontSize: 9, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>{direction === "INBOUND" ? "↓ IN" : "↑ OUT"}</span>}
    </span>
  );
}

function buildThread(msg: ContactMessage) {
  const orig = { id: `orig-${msg.id}`, body: msg.message, direction: "INBOUND" as ReplyDirection, senderName: msg.name, createdAt: msg.createdAt };
  return [orig, ...msg.replies].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "CONVERSATIONS", label: "Conversations" },
  { key: "UNREAD", label: "Unread" },
  { key: "TRANSACTIONAL", label: "Transactional" },
];

/* ─── Main ─── */
export default function CommunicationsPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("ALL");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter, page: String(page), limit: "20" });
      const res = await fetch(`/api/admin/communications?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
      setUnreadCount(data.unreadCount ?? 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filter, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function updateStatus(id: string, status: ContactStatus) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/contact/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (res.ok) {
        setItems(prev => prev.map(item =>
          item.kind === "conversation" && item.data.id === id
            ? { ...item, data: { ...item.data, status } }
            : item
        ));
        if (status === "READ") setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } finally { setSavingId(null); }
  }

  async function handleExpand(item: FeedItem) {
    const key = item.kind === "conversation" ? item.data.id : item.data.id;
    if (expandedId === key) { setExpandedId(null); return; }
    setExpandedId(key);
    if (item.kind === "conversation" && item.data.status === "UNREAD") {
      await updateStatus(item.data.id, "READ");
    }
  }

  async function sendReply(msg: ContactMessage) {
    const text = replyText[msg.id]?.trim();
    if (!text) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/admin/contact/${msg.id}/reply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyText: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setItems(prev => prev.map(item =>
          item.kind === "conversation" && item.data.id === msg.id
            ? { ...item, data: { ...item.data, status: "REPLIED" as ContactStatus, replies: [...item.data.replies, data.reply] } }
            : item
        ));
        setReplyingId(null);
        setReplyText(prev => ({ ...prev, [msg.id]: "" }));
        setReplySuccess(msg.id);
        setTimeout(() => setReplySuccess(null), 3000);
      }
    } finally { setSendingReply(false); }
  }

  // Group items by day for timeline dividers
  const itemsWithDividers: ({ isDivider: true; label: string } | { isDivider: false; item: FeedItem; idx: number })[] = [];
  let lastDay = "";
  items.forEach((item, idx) => {
    const day = fmtDay(item.createdAt);
    if (day !== lastDay) {
      itemsWithDividers.push({ isDivider: true, label: day });
      lastDay = day;
    }
    itemsWithDividers.push({ isDivider: false, item, idx });
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 600, color: "#3a2e24", margin: "0 0 4px" }}>Communications</h1>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>
          {total} item{total !== 1 ? "s" : ""}
          {unreadCount > 0 && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 20, background: "#fffbeb", color: "#d97706", fontSize: 11, fontWeight: 700 }}>{unreadCount} unread</span>}
        </p>
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); setExpandedId(null); }}
            style={{
              padding: "6px 16px", borderRadius: 20, border: `1px solid ${filter === f.key ? "#8B6914" : "#ede8df"}`,
              cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: filter === f.key ? 600 : 400,
              background: filter === f.key ? "#8B6914" : "#fff", color: filter === f.key ? "#fff" : "#5a4a38",
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5,
            }}>
            {f.label}
            {f.key === "UNREAD" && unreadCount > 0 && (
              <span style={{ padding: "0 5px", borderRadius: 8, background: filter === "UNREAD" ? "rgba(255,255,255,0.3)" : "#d97706", color: "#fff", fontSize: 9, fontWeight: 700 }}>{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <div style={{ width: 28, height: 28, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : items.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "48px 20px", textAlign: "center" }}>
          <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#9a876e", margin: 0 }}>Nothing here yet</p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {itemsWithDividers.map((entry, i) => {
              if (entry.isDivider) {
                return (
                  <div key={`div-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 4px" }}>
                    <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#b0a090", fontWeight: 600, whiteSpace: "nowrap" }}>{entry.label}</span>
                    <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
                  </div>
                );
              }

              const { item } = entry;

              /* ── CONVERSATION CARD ── */
              if (item.kind === "conversation") {
                const msg = item.data;
                const isExpanded = expandedId === msg.id;
                const thread = buildThread(msg);
                const replyCount = msg.replies.length;

                return (
                  <div key={msg.id} style={{ background: "#fff", border: `1px solid ${isExpanded ? "#c9a84c" : "#ede8df"}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}>
                    {/* Header row */}
                    <div onClick={() => handleExpand(item)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, background: msg.status === "UNREAD" ? "#fffef9" : "transparent" }}
                      onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                      onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = msg.status === "UNREAD" ? "#fffef9" : "transparent"; }}>
                      {/* left accent: conversation icon */}
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>{msg.name[0].toUpperCase()}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: msg.status === "UNREAD" ? 700 : 600, color: "#3a2e24" }}>{msg.name}</span>
                          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#9a876e" }}>{msg.email}</span>
                          <StatusBadge status={msg.status} />
                          {replyCount > 0 && <span style={{ padding: "1px 6px", borderRadius: 8, background: "#f5f0e8", color: "#8a7060", fontSize: 9, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>}
                        </div>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#5a4a38", fontWeight: msg.status === "UNREAD" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.subject}</div>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#b0a090", marginTop: 1 }}>{fmtDate(msg.createdAt)}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0, marginTop: 4 }}>
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
                            const showDiv = !prev || !isSameDay(prev.createdAt, entry.createdAt);
                            return (
                              <div key={entry.id}>
                                {showDiv && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 8px" }}>
                                    <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
                                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, color: "#b0a090" }}>{fmtDay(entry.createdAt)}</span>
                                    <div style={{ flex: 1, height: 1, background: "#ede8df" }} />
                                  </div>
                                )}
                                <div style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-end" }}>
                                  {!isOut && <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#c9a84c,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>{msg.name[0].toUpperCase()}</span></div>}
                                  <div style={{ maxWidth: "72%" }}>
                                    <div style={{ padding: "8px 12px", borderRadius: isOut ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isOut ? "linear-gradient(135deg,#8B6914,#C9A84C)" : "#f5f0e8", color: isOut ? "#fff" : "#3a2e24", fontFamily: "'Inter',sans-serif", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                      {entry.body}
                                    </div>
                                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, color: "#b0a090", marginTop: 2, textAlign: isOut ? "right" : "left" }}>{entry.senderName} · {fmtTime(entry.createdAt)}</div>
                                  </div>
                                  {isOut && <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#3a2e24", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ color: "#c9a84c", fontSize: 9, fontWeight: 700 }}>AS</span></div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Reply / actions */}
                        <div style={{ padding: "0 18px 14px" }}>
                          {replyingId === msg.id ? (
                            <div style={{ background: "#f0f9f4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                              <textarea value={replyText[msg.id] ?? ""} onChange={e => setReplyText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                rows={3} placeholder={`Reply to ${msg.name}…`} autoFocus
                                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #86efac", fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#3a2e24", background: "#fff", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                              <div style={{ display: "flex", gap: 8, marginTop: 7, alignItems: "center" }}>
                                <button onClick={() => sendReply(msg)} disabled={sendingReply || !replyText[msg.id]?.trim()}
                                  style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: sendingReply || !replyText[msg.id]?.trim() ? "#c8a84c" : "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sendingReply || !replyText[msg.id]?.trim() ? 0.7 : 1 }}>
                                  {sendingReply ? "Sending…" : "Send"}
                                </button>
                                <button onClick={() => setReplyingId(null)} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 12, cursor: "pointer", color: "#5a4a38" }}>Cancel</button>
                                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#9a876e" }}>From hello@artisansstories.com</span>
                              </div>
                              {replySuccess === msg.id && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#15803d", margin: "5px 0 0", fontWeight: 500 }}>✓ Sent</p>}
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                              <button onClick={() => setReplyingId(msg.id)} style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✉ Reply</button>
                              {msg.status !== "REPLIED" && <button onClick={() => updateStatus(msg.id, "REPLIED")} disabled={savingId === msg.id} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid #ede8df", background: "transparent", color: "#15803d", fontFamily: "'Inter',sans-serif", fontSize: 11, cursor: "pointer" }}>✓ Mark Replied</button>}
                              {msg.status !== "ARCHIVED" && <button onClick={() => updateStatus(msg.id, "ARCHIVED")} disabled={savingId === msg.id} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid #ede8df", background: "transparent", color: "#9a876e", fontFamily: "'Inter',sans-serif", fontSize: 11, cursor: "pointer" }}>Archive</button>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              /* ── EMAIL LOG ROW ── */
              const log = item.data as EmailLog;
              const isExpanded = expandedId === log.id;
              const emailAddr = log.direction === "OUTBOUND" ? log.toEmail : log.fromEmail;

              return (
                <div key={log.id} style={{ background: "#fff", border: `1px solid ${isExpanded ? "#c9a84c" : "#ede8df"}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}>
                  <div onClick={() => handleExpand(item)} style={{ padding: "12px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf7f2"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    {/* Email type icon */}
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f5f0e8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3,7 12,13 21,7"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                        <TypeBadge type={log.type} direction={log.direction} />
                        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#9a876e" }}>
                          {log.direction === "OUTBOUND" ? `→ ${emailAddr}` : `← ${emailAddr}`}
                        </span>
                      </div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#3a2e24", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{log.subject}</div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#b0a090", marginTop: 1 }}>{fmtDate(log.createdAt)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      {log.relatedType && log.relatedId && (
                        log.relatedType === "ORDER" ? (
                          <Link href={`/admin/orders/${log.relatedId}`} onClick={e => e.stopPropagation()}
                            style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#8B6914", fontWeight: 600, textDecoration: "none" }}>Order →</Link>
                        ) : log.relatedType === "RETURN" ? (
                          <Link href={`/admin/returns/${log.relatedId}`} onClick={e => e.stopPropagation()}
                            style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#8B6914", fontWeight: 600, textDecoration: "none" }}>Return →</Link>
                        ) : null
                      )}
                      {log.bodyHtml && (
                        <Link href={`/admin/communications/email/${log.id}`} onClick={e => e.stopPropagation()}
                          style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#8B6914", fontWeight: 600, textDecoration: "none" }}>
                          View →
                        </Link>
                      )}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded email summary */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #f0ebe1", padding: "14px 18px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                        {[
                          { label: "Subject", value: log.subject },
                          { label: log.direction === "OUTBOUND" ? "To" : "From", value: emailAddr },
                          ...(log.resendId ? [{ label: "Resend ID", value: log.resendId }] : []),
                        ].map(({ label, value }) => (
                          <tr key={label} style={{ borderBottom: "1px solid #f5f0e8" }}>
                            <td style={{ padding: "5px 0", fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.05em", width: 70, paddingRight: 12, verticalAlign: "top" }}>{label}</td>
                            <td style={{ padding: "5px 0", fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#3a2e24", wordBreak: "break-all" }}>{value}</td>
                          </tr>
                        ))}
                      </table>
                      {log.bodyHtml ? (
                        <Link href={`/admin/communications/email/${log.id}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#8B6914", color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          View Full Email
                        </Link>
                      ) : (
                        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#b0a090", margin: 0 }}>No body stored for this entry.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1, color: "#5a4a38" }}>Prev</button>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#9a876e" }}>Page {page} of {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: page === pages ? "not-allowed" : "pointer", opacity: page === pages ? 0.5 : 1, color: "#5a4a38" }}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
