"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface EmailLog {
  id: string;
  type: string;
  direction: "OUTBOUND" | "INBOUND";
  toEmail: string;
  fromEmail: string;
  subject: string;
  bodyHtml: string | null;
  resendId: string | null;
  relatedId: string | null;
  relatedType: string | null;
  createdAt: string;
}

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(d));
}

const TYPE_LABELS: Record<string, string> = {
  ORDER_CONFIRMATION: "Order Confirmation",
  ORDER_SHIPPED: "Order Shipped",
  MAGIC_LINK_CUSTOMER: "Customer Sign-in Link",
  MAGIC_LINK_ADMIN: "Admin Sign-in Link",
  CONTACT_INBOUND: "Contact Form",
  CONTACT_REPLY: "Contact Reply",
  RETURN_REQUEST: "Return Request",
  RETURN_APPROVED: "Return Approved",
  RETURN_REJECTED: "Return Rejected",
  REFUND_ISSUED: "Refund Issued",
  SUBSCRIBE_WELCOME: "Welcome Email",
  SYSTEM: "System",
};

export default function EmailViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [log, setLog] = useState<EmailLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/email-log/${id}`)
      .then((r) => { if (r.status === 404) { setNotFound(true); return null; } return r.json(); })
      .then((data) => { if (data?.log) setLog(data.log); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
        <div style={{ width: 28, height: 28, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (notFound || !log) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, color: "#9a876e", margin: "0 0 16px" }}>Email not found</p>
        <Link href="/admin/communications" style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#8B6914", textDecoration: "none" }}>← Back to Communications</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/communications" style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#8B6914", textDecoration: "none" }}>
          ← Communications
        </Link>
      </div>

      {/* Email metadata header */}
      <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{
            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
            fontFamily: "'Inter',sans-serif", background: "#fdf5e4", color: "#8B6914",
          }}>
            {TYPE_LABELS[log.type] ?? log.type}
          </span>
          <span style={{
            padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
            fontFamily: "'Inter',sans-serif",
            background: log.direction === "INBOUND" ? "#eff6ff" : "#f0fdf4",
            color: log.direction === "INBOUND" ? "#2563eb" : "#15803d",
          }}>
            {log.direction === "INBOUND" ? "↓ INBOUND" : "↑ OUTBOUND"}
          </span>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e", marginLeft: "auto" }}>
            {fmtDate(log.createdAt)}
          </span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          {[
            { label: "Subject", value: log.subject },
            { label: log.direction === "OUTBOUND" ? "To" : "From", value: log.direction === "OUTBOUND" ? log.toEmail : log.fromEmail },
            { label: log.direction === "OUTBOUND" ? "From" : "To", value: log.direction === "OUTBOUND" ? log.fromEmail : log.toEmail },
            ...(log.resendId ? [{ label: "Resend ID", value: log.resendId }] : []),
            ...(log.relatedType && log.relatedId ? [{ label: "Related", value: `${log.relatedType} / ${log.relatedId}` }] : []),
          ].map(({ label, value }) => (
            <tr key={label} style={{ borderBottom: "1px solid #f5f0e8" }}>
              <td style={{ padding: "8px 0", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.05em", width: 80, verticalAlign: "top", paddingRight: 16 }}>{label}</td>
              <td style={{ padding: "8px 0", fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#3a2e24", wordBreak: "break-all" }}>{value}</td>
            </tr>
          ))}
        </table>
      </div>

      {/* Email body */}
      <div style={{ background: "#fff", border: "1px solid #ede8df", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #ede8df", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, color: "#9a876e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Email Body
          </span>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#b0a090" }}>Read only</span>
        </div>

        {log.bodyHtml ? (
          <div style={{ background: "#f5f5f5", padding: 20 }}>
            {/* Sandboxed iframe to safely render HTML email */}
            <iframe
              srcDoc={log.bodyHtml}
              style={{
                width: "100%",
                minHeight: 600,
                border: "none",
                background: "#fff",
                borderRadius: 8,
                display: "block",
              }}
              title={`Email: ${log.subject}`}
              sandbox="allow-same-origin"
              onLoad={(e) => {
                // Auto-resize to content height
                const iframe = e.currentTarget;
                try {
                  const doc = iframe.contentDocument;
                  if (doc) {
                    iframe.style.height = `${doc.documentElement.scrollHeight + 32}px`;
                  }
                } catch { /* cross-origin, leave default height */ }
              }}
            />
          </div>
        ) : (
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>
              Email body not available for this log entry.
            </p>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#b0a090", margin: "6px 0 0" }}>
              Body capture is available for emails sent after this feature was enabled.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
