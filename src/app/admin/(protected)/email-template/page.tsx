"use client";

import { useState, useEffect, useRef } from "react";

const GOLD = "#8B6914";
const R2_PUBLIC = "https://pub-0225431098954524b5abd8a1b398b466.r2.dev";

interface SocialLink {
  id: string;
  platform: string;
  label: string;
  url: string;
  color: string;
  enabled: boolean;
}

interface SignatureData {
  avatarUrl: string;
  name: string;
  subtitle: string;
  closing: string;
}

interface EmailTemplate {
  logoUrl: string;
  headerBgColor: string;
  cardBgColor: string;
  greetingText: string;
  greetingItalic: boolean;
  bodyHtml: string;
  socialLinks: SocialLink[];
  signatureData: SignatureData;
  textColorDark: string;
  textColorMedium: string;
  textColorLight: string;
  accentColor: string;
  // legacy (kept for backward compat saves)
  bodyParagraph1?: string;
  bodyParagraph2?: string;
  bulletSectionTitle?: string;
  bullet1Label?: string;
  bullet1Text?: string;
  bullet2Label?: string;
  bullet2Text?: string;
  bullet3Label?: string;
  bullet3Text?: string;
  closingText?: string;
  signatureText?: string;
  signatureName?: string;
  signatureSubtitle?: string;
  avatarUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  instagramButtonColor?: string;
  tiktokButtonColor?: string;
}

const DEFAULT_SOCIAL_LINKS: SocialLink[] = [
  { id: "instagram", platform: "instagram", label: "Instagram", url: "https://instagram.com/artisansstories", color: "#E4405F", enabled: true },
  { id: "tiktok",    platform: "tiktok",    label: "TikTok",    url: "https://tiktok.com/@artisansstories",  color: "#000000", enabled: true },
  { id: "facebook",  platform: "facebook",  label: "Facebook",  url: "https://facebook.com/artisansstories", color: "#1877F2", enabled: false },
  { id: "pinterest", platform: "pinterest", label: "Pinterest", url: "https://pinterest.com/artisansstories", color: "#E60023", enabled: false },
  { id: "email",     platform: "email",     label: "Email",     url: "mailto:anna@artisansstories.com",       color: "#8B6914", enabled: true },
];

// ─── Platform SVG Icons ───────────────────────────────────────────────────────

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

function TikTokIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.2 8.2 0 004.79 1.52V6.76a4.85 4.85 0 01-1.02-.07z"/>
    </svg>
  );
}

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function PinterestIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
    </svg>
  );
}

function EmailIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
    </svg>
  );
}

const PLATFORM_ICON_MAP: Record<string, React.ReactNode> = {
  instagram: <InstagramIcon size={20} />,
  tiktok:    <TikTokIcon size={20} />,
  facebook:  <FacebookIcon size={20} />,
  pinterest: <PinterestIcon size={20} />,
  email:     <EmailIcon size={20} />,
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function EmailTemplateEditor() {
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadTemplate();
  }, []);

  useEffect(() => {
    if (template) generatePreview();
  }, [template]);

  async function loadTemplate() {
    try {
      const res = await fetch("/api/admin/email-template", { cache: "no-store" });
      const data = await res.json();
      if (data.template) {
        const t = data.template;
        // Normalize bodyHtml from legacy fields if absent
        if (!t.bodyHtml) {
          t.bodyHtml = [
            t.bodyParagraph1 ? `<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">${t.bodyParagraph1}</p>` : "",
            t.bodyParagraph2 ? `<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">${t.bodyParagraph2}</p>` : "",
            t.bulletSectionTitle ? `<p style="font-size:16px;color:#4a3728;font-weight:600;margin-bottom:12px;">${t.bulletSectionTitle}</p>` : "",
            (t.bullet1Label || t.bullet2Label || t.bullet3Label)
              ? `<ul style="margin:0 0 20px 0;padding-left:20px;">` +
                (t.bullet1Label ? `<li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:8px;"><strong>${t.bullet1Label}</strong> ${t.bullet1Text || ""}</li>` : "") +
                (t.bullet2Label ? `<li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:8px;"><strong>${t.bullet2Label}</strong> ${t.bullet2Text || ""}</li>` : "") +
                (t.bullet3Label ? `<li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:8px;"><strong>${t.bullet3Label}</strong> ${t.bullet3Text || ""}</li>` : "") +
                `</ul>`
              : "",
            t.closingText ? `<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">${t.closingText}</p>` : "",
          ].join("");
        }
        // Normalize socialLinks
        if (!t.socialLinks || !Array.isArray(t.socialLinks)) {
          t.socialLinks = DEFAULT_SOCIAL_LINKS;
        }
        // Normalize signatureData
        if (!t.signatureData) {
          t.signatureData = {
            avatarUrl: t.avatarUrl || "",
            name: t.signatureName || "",
            subtitle: t.signatureSubtitle || "",
            closing: t.signatureText || "",
          };
        }
        setTemplate(t as EmailTemplate);
      }
    } catch (error) {
      console.error("Failed to load template:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    if (!template) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/email-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...template,
          // keep legacy fields in sync from signatureData
          avatarUrl: template.signatureData.avatarUrl,
          signatureName: template.signatureData.name,
          signatureSubtitle: template.signatureData.subtitle,
          signatureText: template.signatureData.closing,
        }),
      });
      if (!res.ok) alert("Failed to save template");
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/email-template/upload-logo", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url) setTemplate((t) => t ? { ...t, logoUrl: data.url } : t);
  }

  async function uploadAvatar(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/email-template/upload-avatar", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url && template) {
      setTemplate({ ...template, signatureData: { ...template.signatureData, avatarUrl: data.url } });
    }
  }

  // ─── Toolbar helpers ───────────────────────────────────────────────────────

  function wrapSelection(before: string, after: string) {
    const el = bodyRef.current;
    if (!el || !template) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end);
    const newVal = el.value.slice(0, start) + before + selected + after + el.value.slice(end);
    setTemplate({ ...template, bodyHtml: newVal });
    setTimeout(() => {
      el.selectionStart = start + before.length;
      el.selectionEnd = end + before.length;
      el.focus();
    }, 0);
  }

  function insertAtCursor(snippet: string) {
    const el = bodyRef.current;
    if (!el || !template) return;
    const start = el.selectionStart;
    const newVal = el.value.slice(0, start) + snippet + el.value.slice(start);
    setTemplate({ ...template, bodyHtml: newVal });
    setTimeout(() => {
      el.selectionStart = start + snippet.length;
      el.selectionEnd = start + snippet.length;
      el.focus();
    }, 0);
  }

  // ─── Preview generation ────────────────────────────────────────────────────

  function generatePreview() {
    if (!template) return;
    const enabledLinks = template.socialLinks.filter((l) => l.enabled);

    const socialIconsHtml =
      enabledLinks.length === 0
        ? ""
        : `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding-bottom:28px;">
            <tr><td style="text-align:center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;"><tr>
                ${enabledLinks
                  .map((l) => {
                    const iconHtml =
                      l.platform === "instagram"
                        ? `<img src="${R2_PUBLIC}/email/instagram-icon.svg" width="22" height="22" style="display:block;"/>`
                        : l.platform === "tiktok"
                        ? `<img src="${R2_PUBLIC}/email/tiktok-icon.svg" width="22" height="22" style="display:block;"/>`
                        : l.platform === "facebook"
                        ? `<span style="font-size:18px;font-weight:700;font-family:Arial,sans-serif;color:#fff;">f</span>`
                        : l.platform === "pinterest"
                        ? `<span style="font-size:18px;font-weight:700;font-family:Arial,sans-serif;color:#fff;">P</span>`
                        : `<span style="font-size:14px;font-family:Arial,sans-serif;color:#fff;">✉</span>`;
                    return `<td style="padding:0 6px;">
                      <a href="${l.url}" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:${l.color};border-radius:50%;text-decoration:none;">
                        ${iconHtml}
                      </a>
                    </td>`;
                  })
                  .join("")}
              </tr></table>
            </td></tr>
          </table>`;

    const sig = template.signatureData;

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:${template.headerBgColor};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${template.headerBgColor};">
    <tr><td style="padding:40px 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">

        <tr><td style="padding-bottom:32px;">
          <div style="height:3px;background:linear-gradient(90deg,transparent,#8b5e3c,${template.accentColor},#8b5e3c,transparent);border-radius:2px;"></div>
        </td></tr>

        <tr><td style="background:${template.cardBgColor};border-radius:12px;padding:40px 32px;border:1px solid rgba(139,94,60,0.12);">

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="text-align:center;padding-bottom:28px;">
              ${template.logoUrl ? `<img src="${template.logoUrl}" alt="Logo" width="320" style="display:block;margin:0 auto;max-width:320px;height:auto;"/>` : `<div style="height:60px;background:#e0d5c5;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#8B6914;">Logo</div>`}
            </td></tr>
          </table>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="text-align:center;padding-bottom:28px;">
              <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,${template.accentColor},transparent);margin:0 auto;"></div>
            </td></tr>
          </table>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="font-size:17px;color:${template.textColorDark};line-height:1.6;padding-bottom:24px;${template.greetingItalic ? "font-style:italic;" : ""}text-align:left;">
              ${template.greetingText}
            </td></tr>
          </table>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;padding-bottom:24px;text-align:left;">
              ${template.bodyHtml}
            </td></tr>
          </table>

          ${socialIconsHtml}

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="text-align:center;padding-bottom:24px;">
              <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,${template.accentColor},transparent);margin:0 auto;"></div>
            </td></tr>
          </table>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:top;">
                    ${sig.avatarUrl ? `<img src="${sig.avatarUrl}" alt="${sig.name}" width="48" height="48" style="border-radius:50%;display:block;border:2px solid ${template.accentColor};"/>` : `<div style="width:48px;height:48px;border-radius:50%;background:#e0d5c5;border:2px solid ${template.accentColor};"></div>`}
                  </td>
                  <td style="vertical-align:top;padding-top:4px;">
                    <div style="font-size:13px;color:${template.textColorLight};font-family:Arial,Helvetica,sans-serif;letter-spacing:0.04em;line-height:1.8;">
                      ${sig.closing}<br/>
                      <span style="color:${template.textColorDark};font-family:Georgia,serif;font-size:18px;font-style:italic;">${sig.name}</span><br/>
                      <span style="color:#8a7a66;font-size:11px;">${sig.subtitle}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

        </td></tr>

        <tr><td style="text-align:center;font-size:11px;color:#b8967a;padding-top:28px;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.04em;line-height:1.8;">
          © ${new Date().getFullYear()} Artisans' Stories · El Salvador to the United States<br/>
          <a href="https://artisansstories.com" style="color:#8b5e3c;text-decoration:none;">artisansstories.com</a>
        </td></tr>

        <tr><td style="padding-top:24px;">
          <div style="height:3px;background:linear-gradient(90deg,transparent,#8b5e3c,${template.accentColor},#8b5e3c,transparent);border-radius:2px;"></div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
    setPreviewHtml(html);
  }

  if (loading || !template) return <div style={{ padding: 32 }}>Loading...</div>;

  const logoFilename = template.logoUrl ? template.logoUrl.split("/").pop() || "" : "";

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f6", padding: "32px" }}>
      <div style={{ maxWidth: 1600, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#3a2e24", marginBottom: 8 }}>
            Welcome Email Template Editor
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280" }}>
            Edit every part of the welcome email sent to new subscribers
          </p>
        </div>

        <div style={{ display: "flex", gap: 32 }}>
          {/* ── Editor ── */}
          <div style={{ flex: 1, maxWidth: 700 }}>
            <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, padding: 24 }}>

              {/* ── Logo Section ── */}
              <Section title="Logo">
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  {template.logoUrl ? (
                    <img
                      src={template.logoUrl}
                      alt="Logo"
                      style={{ width: 80, height: 80, objectFit: "contain", border: "1px solid #e0d5c5", borderRadius: 8 }}
                    />
                  ) : (
                    <div style={{ width: 80, height: 80, border: "1px dashed #e0d5c5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#a89070" }}>
                      No logo
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {logoFilename && (
                      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {logoFilename}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <label style={{ cursor: "pointer" }}>
                        <span style={{ display: "inline-block", padding: "7px 14px", background: GOLD, color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Upload New
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
                        />
                      </label>
                      {template.logoUrl && (
                        <button
                          onClick={() => setTemplate({ ...template, logoUrl: "" })}
                          style={{ padding: "7px 14px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 16 }}>
                  <ColorPicker label="Header Background" value={template.headerBgColor} onChange={(v) => setTemplate({ ...template, headerBgColor: v })} />
                  <ColorPicker label="Card Background" value={template.cardBgColor} onChange={(v) => setTemplate({ ...template, cardBgColor: v })} />
                </div>
              </Section>

              {/* ── Greeting ── */}
              <Section title="Greeting">
                <Textarea label="Greeting Text" value={template.greetingText} onChange={(v) => setTemplate({ ...template, greetingText: v })} rows={2} />
                <Checkbox label="Italic" checked={template.greetingItalic} onChange={(v) => setTemplate({ ...template, greetingItalic: v })} />
              </Section>

              {/* ── Email Body ── */}
              <Section title="Email Body">
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                  Raw HTML — includes paragraphs, bullet lists, and closing text.
                </p>
                {/* Toolbar */}
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  {[
                    { label: "B", title: "Bold", action: () => wrapSelection("<strong>", "</strong>"), style: { fontWeight: 700 } },
                    { label: "I", title: "Italic", action: () => wrapSelection("<em>", "</em>"), style: { fontStyle: "italic" } },
                    { label: "P", title: "Insert Paragraph", action: () => insertAtCursor('<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">Paragraph text here</p>') },
                    { label: "H", title: "Insert Heading", action: () => insertAtCursor('<p style="font-size:16px;color:#4a3728;font-weight:600;margin-bottom:12px;">Heading here</p>') },
                    { label: "• List", title: "Insert List", action: () => insertAtCursor('<ul style="margin:0 0 20px 0;padding-left:20px;"><li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:8px;">List item</li></ul>') },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      title={btn.title}
                      onClick={btn.action}
                      style={{
                        padding: "4px 12px",
                        background: "#f5f0e8",
                        border: "1px solid #e0d5c5",
                        borderRadius: 20,
                        fontSize: 13,
                        cursor: "pointer",
                        color: "#4a3728",
                        ...btn.style,
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={bodyRef}
                  value={template.bodyHtml}
                  onChange={(e) => setTemplate({ ...template, bodyHtml: e.target.value })}
                  style={{
                    width: "100%",
                    height: 380,
                    padding: "10px 12px",
                    border: "1px solid #e0d5c5",
                    borderRadius: 6,
                    fontSize: 13,
                    fontFamily: "monospace",
                    lineHeight: 1.6,
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </Section>

              {/* ── Social Links ── */}
              <Section title="Social Links">
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                  Toggle which platforms appear in the email. Only enabled links are sent.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {template.socialLinks.map((link, idx) => (
                    <div
                      key={link.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: "1px solid #e0d5c5",
                        borderRadius: 8,
                        opacity: link.enabled ? 1 : 0.45,
                        transition: "opacity 0.15s",
                        background: "#faf9f6",
                      }}
                    >
                      {/* Toggle */}
                      <label style={{ position: "relative", display: "inline-block", width: 36, height: 20, flexShrink: 0, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={link.enabled}
                          onChange={(e) => {
                            const updated = [...template.socialLinks];
                            updated[idx] = { ...link, enabled: e.target.checked };
                            setTemplate({ ...template, socialLinks: updated });
                          }}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: "absolute", inset: 0,
                          background: link.enabled ? GOLD : "#d1d5db",
                          borderRadius: 20,
                          transition: "background 0.2s",
                        }} />
                        <span style={{
                          position: "absolute",
                          top: 3, left: link.enabled ? 18 : 3,
                          width: 14, height: 14,
                          background: "#fff",
                          borderRadius: "50%",
                          transition: "left 0.2s",
                        }} />
                      </label>

                      {/* Platform icon */}
                      <span style={{ color: link.color, flexShrink: 0, width: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {PLATFORM_ICON_MAP[link.platform]}
                      </span>

                      {/* Platform name */}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", width: 72, flexShrink: 0 }}>{link.label}</span>

                      {/* URL */}
                      <input
                        type="text"
                        value={link.url}
                        onChange={(e) => {
                          const updated = [...template.socialLinks];
                          updated[idx] = { ...link, url: e.target.value };
                          setTemplate({ ...template, socialLinks: updated });
                        }}
                        style={{ flex: 1, padding: "6px 10px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 13 }}
                      />

                      {/* Color picker */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <input
                          type="color"
                          value={link.color}
                          onChange={(e) => {
                            const updated = [...template.socialLinks];
                            updated[idx] = { ...link, color: e.target.value };
                            setTemplate({ ...template, socialLinks: updated });
                          }}
                          style={{ width: 32, height: 32, border: "1px solid #e0d5c5", borderRadius: 4, cursor: "pointer", padding: 2 }}
                        />
                        <input
                          type="text"
                          value={link.color}
                          onChange={(e) => {
                            const updated = [...template.socialLinks];
                            updated[idx] = { ...link, color: e.target.value };
                            setTemplate({ ...template, socialLinks: updated });
                          }}
                          style={{ width: 72, padding: "6px 8px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Signature ── */}
              <Section title="Signature">
                <div style={{ border: "1px solid #e0d5c5", borderRadius: 10, padding: 20, background: "#faf9f6" }}>
                  {/* Avatar row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                    {template.signatureData.avatarUrl ? (
                      <img
                        src={template.signatureData.avatarUrl}
                        alt="Avatar"
                        style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: `2px solid ${template.accentColor}` }}
                      />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: "50%", border: "1px dashed #e0d5c5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#a89070" }}>
                        Avatar
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <label style={{ cursor: "pointer" }}>
                        <span style={{ display: "inline-block", padding: "6px 12px", background: GOLD, color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          Upload
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
                        />
                      </label>
                      {template.signatureData.avatarUrl && (
                        <button
                          onClick={() => setTemplate({ ...template, signatureData: { ...template.signatureData, avatarUrl: "" } })}
                          style={{ padding: "6px 12px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Fields */}
                  <div style={{ display: "grid", gap: 12 }}>
                    {(["name", "subtitle", "closing"] as const).map((field) => (
                      <label key={field} style={{ display: "block" }}>
                        <span style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, textTransform: "capitalize", color: "#4a3728" }}>{field}:</span>
                        <input
                          type="text"
                          value={template.signatureData[field]}
                          onChange={(e) => setTemplate({ ...template, signatureData: { ...template.signatureData, [field]: e.target.value } })}
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 14 }}
                        />
                      </label>
                    ))}
                  </div>
                  {/* Mini preview */}
                  <div style={{ marginTop: 16, padding: "12px 16px", background: "#fff", borderRadius: 8, border: "1px solid #e0d5c5" }}>
                    <p style={{ fontSize: 11, color: "#a89070", marginBottom: 8, fontWeight: 600 }}>Preview</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {template.signatureData.avatarUrl ? (
                        <img src={template.signatureData.avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: `2px solid ${template.accentColor}` }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#e0d5c5" }} />
                      )}
                      <div style={{ fontSize: 12, color: template.textColorLight, fontFamily: "sans-serif", lineHeight: 1.7 }}>
                        {template.signatureData.closing}<br />
                        <span style={{ color: template.textColorDark, fontFamily: "Georgia, serif", fontSize: 16, fontStyle: "italic" }}>{template.signatureData.name}</span><br />
                        <span style={{ color: "#8a7a66", fontSize: 11 }}>{template.signatureData.subtitle}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Section>

              {/* ── Colors ── */}
              <Section title="Colors">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <ColorPicker label="Text Dark" value={template.textColorDark} onChange={(v) => setTemplate({ ...template, textColorDark: v })} />
                  <ColorPicker label="Text Medium" value={template.textColorMedium} onChange={(v) => setTemplate({ ...template, textColorMedium: v })} />
                  <ColorPicker label="Text Light" value={template.textColorLight} onChange={(v) => setTemplate({ ...template, textColorLight: v })} />
                  <ColorPicker label="Accent Color" value={template.accentColor} onChange={(v) => setTemplate({ ...template, accentColor: v })} />
                </div>
              </Section>

              <button
                onClick={saveTemplate}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "14px 24px",
                  background: GOLD,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  marginTop: 8,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>

          {/* ── Preview ── */}
          <div style={{ width: 650, flexShrink: 0 }}>
            <div style={{ position: "sticky", top: 32 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#3a2e24" }}>Live Preview</h3>
              <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: "100%", height: "860px", border: "none" }}
                  title="Email Preview"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #e0d5c5" }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#3a2e24" }}>{title}</h3>
      {children}
    </div>
  );
}

function Textarea({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
      />
    </label>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 48, height: 36, border: "1px solid #e0d5c5", borderRadius: 6, cursor: "pointer", padding: 2 }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, padding: "6px 10px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }}
        />
      </div>
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 16 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, cursor: "pointer" }}
      />
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
    </label>
  );
}
