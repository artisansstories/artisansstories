"use client";

import { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

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

// ─── Email HTML conversion ────────────────────────────────────────────────────

function convertToEmailHtml(html: string): string {
  return html
    .replace(/<p>/g, '<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">')
    .replace(/<h1>/g, '<p style="font-size:18px;color:#4a3728;font-weight:600;margin-bottom:12px;">')
    .replace(/<\/h1>/g, "</p>")
    .replace(/<h2>/g, '<p style="font-size:18px;color:#4a3728;font-weight:600;margin-bottom:12px;">')
    .replace(/<\/h2>/g, "</p>")
    .replace(/<h3>/g, '<p style="font-size:18px;color:#4a3728;font-weight:600;margin-bottom:12px;">')
    .replace(/<\/h3>/g, "</p>")
    .replace(/<ul>/g, '<ul style="margin:0 0 20px 0;padding-left:20px;">')
    .replace(/<ol>/g, '<ol style="margin:0 0 20px 0;padding-left:20px;">')
    .replace(/<li>/g, '<li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:8px;">')
    .replace(/<a /g, '<a style="color:#8B6914;text-decoration:underline;" ');
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EmailTemplateEditor() {
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  const editorInitialized = useRef(false);
  const editorReady = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write your email body here..." }),
    ],
    content: "",
    onUpdate({ editor }) {
      const emailHtml = convertToEmailHtml(editor.getHTML());
      setTemplate((t) => (t ? { ...t, bodyHtml: emailHtml } : t));
      if (editorReady.current) setIsDirty(true);
    },
  });

  // Responsive detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    loadTemplate();
  }, []);

  useEffect(() => {
    if (template) generatePreview();
  }, [template]);

  // Load initial content into editor once both are ready
  useEffect(() => {
    if (template && editor && !editorInitialized.current) {
      editorInitialized.current = true;
      editor.commands.setContent(template.bodyHtml || "");
      const timer = setTimeout(() => {
        editorReady.current = true;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [template, editor]);

  // ── updateTemplate: use for all user-initiated changes ──────────────────────
  function updateTemplate(patch: Partial<EmailTemplate> | ((t: EmailTemplate) => EmailTemplate)) {
    if (typeof patch === "function") {
      setTemplate((t) => (t ? patch(t) : t));
    } else {
      setTemplate((t) => (t ? { ...t, ...patch } : t));
    }
    setIsDirty(true);
  }

  // ─── Load ─────────────────────────────────────────────────────────────────

  async function loadTemplate() {
    try {
      const res = await fetch("/api/admin/email-template", { cache: "no-store" });
      const data = await res.json();
      if (data.template) {
        const t = data.template;
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
        if (!t.socialLinks || !Array.isArray(t.socialLinks)) {
          t.socialLinks = DEFAULT_SOCIAL_LINKS;
        }
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

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function saveTemplate() {
    if (!template) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/email-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...template,
          avatarUrl: template.signatureData.avatarUrl,
          signatureName: template.signatureData.name,
          signatureSubtitle: template.signatureData.subtitle,
          signatureText: template.signatureData.closing,
        }),
      });
      if (!res.ok) {
        alert("Failed to save template");
      } else {
        setIsDirty(false);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  // ─── Uploads ──────────────────────────────────────────────────────────────

  async function uploadLogo(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/email-template/upload-logo", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url) updateTemplate({ logoUrl: data.url });
  }

  async function uploadAvatar(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/email-template/upload-avatar", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url && template) {
      updateTemplate({ signatureData: { ...template.signatureData, avatarUrl: data.url } });
    }
  }

  // ─── Preview generation ───────────────────────────────────────────────────

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

  // ─── Editor Panel ─────────────────────────────────────────────────────────

  const editorPanel = (
    <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, padding: isMobile ? 16 : 24 }}>

      {/* Logo */}
      <Section title="Logo">
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {template.logoUrl ? (
            <img src={template.logoUrl} alt="Logo" style={{ width: 80, height: 80, objectFit: "contain", border: "1px solid #e0d5c5", borderRadius: 8 }} />
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
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
              </label>
              {template.logoUrl && (
                <button onClick={() => updateTemplate({ logoUrl: "" })} style={{ padding: "7px 14px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 16 }}>
          <ColorPicker label="Header Background" value={template.headerBgColor} onChange={(v) => updateTemplate({ headerBgColor: v })} />
          <ColorPicker label="Card Background" value={template.cardBgColor} onChange={(v) => updateTemplate({ cardBgColor: v })} />
        </div>
      </Section>

      {/* Greeting */}
      <Section title="Greeting">
        <Textarea label="Greeting Text" value={template.greetingText} onChange={(v) => updateTemplate({ greetingText: v })} rows={2} />
        <Checkbox label="Italic" checked={template.greetingItalic} onChange={(v) => updateTemplate({ greetingItalic: v })} />
      </Section>

      {/* Email Body — TipTap */}
      <Section title="Email Body">
        {/* Toolbar */}
        <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap", padding: "8px 10px", background: "#faf9f6", border: "1px solid #e0d5c5", borderRadius: "8px 8px 0 0", borderBottom: "none" }}>
          <TipTapButton
            active={editor?.isActive("bold") ?? false}
            title="Bold"
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
          >
            <strong>B</strong>
          </TipTapButton>
          <TipTapButton
            active={editor?.isActive("italic") ?? false}
            title="Italic"
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
          >
            <em>I</em>
          </TipTapButton>
          <TipTapButton
            active={editor?.isActive("heading", { level: 2 }) ?? false}
            title="Heading"
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 2 }).run(); }}
          >
            H
          </TipTapButton>
          <TipTapButton
            active={editor?.isActive("bulletList") ?? false}
            title="Bullet List"
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
          >
            • List
          </TipTapButton>
          <TipTapButton
            active={editor?.isActive("orderedList") ?? false}
            title="Ordered List"
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }}
          >
            1. List
          </TipTapButton>
          <TipTapButton
            active={editor?.isActive("link") ?? false}
            title="Link"
            onMouseDown={(e) => {
              e.preventDefault();
              if (!editor) return;
              if (editor.isActive("link")) {
                editor.chain().focus().unsetLink().run();
              } else {
                const url = window.prompt("Enter URL:");
                if (url) editor.chain().focus().setLink({ href: url }).run();
              }
            }}
          >
            🔗
          </TipTapButton>
          <TipTapButton
            active={false}
            title="Clear Formatting"
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().clearNodes().unsetAllMarks().run(); }}
          >
            ✕ Clear
          </TipTapButton>
        </div>
        <div
          className="tiptap-body-editor"
          style={{ border: "1px solid #e0d5c5", borderRadius: "0 0 8px 8px", background: "#fff", minHeight: 320 }}
        >
          <EditorContent editor={editor} />
        </div>
      </Section>

      {/* Social Links */}
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
                flexWrap: isMobile ? "wrap" : "nowrap",
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
                    updateTemplate({ socialLinks: updated });
                  }}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{ position: "absolute", inset: 0, background: link.enabled ? GOLD : "#d1d5db", borderRadius: 20, transition: "background 0.2s" }} />
                <span style={{ position: "absolute", top: 3, left: link.enabled ? 18 : 3, width: 14, height: 14, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
              </label>

              <span style={{ color: link.color, flexShrink: 0, width: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {PLATFORM_ICON_MAP[link.platform]}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#3a2e24", width: 72, flexShrink: 0 }}>{link.label}</span>

              <input
                type="text"
                value={link.url}
                onChange={(e) => {
                  const updated = [...template.socialLinks];
                  updated[idx] = { ...link, url: e.target.value };
                  updateTemplate({ socialLinks: updated });
                }}
                style={{ flex: 1, minWidth: 120, padding: "6px 10px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 13 }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <input
                  type="color"
                  value={link.color}
                  onChange={(e) => {
                    const updated = [...template.socialLinks];
                    updated[idx] = { ...link, color: e.target.value };
                    updateTemplate({ socialLinks: updated });
                  }}
                  style={{ width: 32, height: 32, border: "1px solid #e0d5c5", borderRadius: 4, cursor: "pointer", padding: 2 }}
                />
                <input
                  type="text"
                  value={link.color}
                  onChange={(e) => {
                    const updated = [...template.socialLinks];
                    updated[idx] = { ...link, color: e.target.value };
                    updateTemplate({ socialLinks: updated });
                  }}
                  style={{ width: 72, padding: "6px 8px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Signature */}
      <Section title="Signature">
        <div style={{ border: "1px solid #e0d5c5", borderRadius: 10, padding: 20, background: "#faf9f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            {template.signatureData.avatarUrl ? (
              <img src={template.signatureData.avatarUrl} alt="Avatar" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: `2px solid ${template.accentColor}` }} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: "50%", border: "1px dashed #e0d5c5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#a89070" }}>
                Avatar
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ cursor: "pointer" }}>
                <span style={{ display: "inline-block", padding: "6px 12px", background: GOLD, color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Upload</span>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }} />
              </label>
              {template.signatureData.avatarUrl && (
                <button
                  onClick={() => updateTemplate({ signatureData: { ...template.signatureData, avatarUrl: "" } })}
                  style={{ padding: "6px 12px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {(["name", "subtitle", "closing"] as const).map((field) => (
              <label key={field} style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, textTransform: "capitalize", color: "#4a3728" }}>{field}:</span>
                <input
                  type="text"
                  value={template.signatureData[field]}
                  onChange={(e) => updateTemplate({ signatureData: { ...template.signatureData, [field]: e.target.value } })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }}
                />
              </label>
            ))}
          </div>
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

      {/* Colors */}
      <Section title="Colors">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <ColorPicker label="Text Dark" value={template.textColorDark} onChange={(v) => updateTemplate({ textColorDark: v })} />
          <ColorPicker label="Text Medium" value={template.textColorMedium} onChange={(v) => updateTemplate({ textColorMedium: v })} />
          <ColorPicker label="Text Light" value={template.textColorLight} onChange={(v) => updateTemplate({ textColorLight: v })} />
          <ColorPicker label="Accent Color" value={template.accentColor} onChange={(v) => updateTemplate({ accentColor: v })} />
        </div>
      </Section>

      {/* Desktop save button (inside editor panel) */}
      {!isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={saveTemplate}
            disabled={saving}
            style={{
              flex: 1,
              padding: "14px 24px",
              background: GOLD,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Template"}
          </button>
          {isDirty && (
            <span style={{ fontSize: 13, color: "#f59e0b", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
              <span style={{ width: 8, height: 8, background: "#f59e0b", borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
              Unsaved changes
            </span>
          )}
          {saveStatus === "saved" && !isDirty && (
            <span style={{ fontSize: 13, color: "#10b981", whiteSpace: "nowrap" }}>Saved ✓</span>
          )}
        </div>
      )}
    </div>
  );

  // ─── Preview Panel ────────────────────────────────────────────────────────

  const desktopPreview = (
    <div style={{ position: "sticky", top: 32 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "#3a2e24", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Live Preview
      </h3>
      {/* Phone frame */}
      <div style={{
        width: 390,
        borderRadius: 40,
        border: "8px solid #2d2420",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        overflow: "hidden",
        background: "#2d2420",
        margin: "0 auto",
      }}>
        {/* Notch */}
        <div style={{ display: "flex", justifyContent: "center", background: "#1a1210", paddingTop: 8, paddingBottom: 0 }}>
          <div style={{ width: 120, height: 24, background: "#2d2420", borderRadius: "0 0 16px 16px" }} />
        </div>
        {/* URL bar */}
        <div style={{ background: "#f5f0e8", padding: "6px 16px", display: "flex", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "3px 14px", fontSize: 11, color: "#6b7280", border: "1px solid #e0d5c5" }}>
            artisansstories.com
          </div>
        </div>
        {/* Email iframe — scaled to fit phone frame */}
        <div style={{ width: "100%", height: 640, overflow: "hidden", borderRadius: "0 0 32px 32px", background: "#f5ede0" }}>
          <iframe
            srcDoc={previewHtml}
            style={{
              width: 600,
              height: 1028,
              border: "none",
              display: "block",
              transformOrigin: "0 0",
              transform: "scale(0.623)",
            }}
            title="Email Preview"
          />
        </div>
      </div>
    </div>
  );

  const mobilePreview = (
    <div style={{ padding: "0 0 16px" }}>
      <iframe
        srcDoc={previewHtml}
        style={{ width: "100%", height: 500, border: "1px solid #e0d5c5", borderRadius: 8 }}
        title="Email Preview"
      />
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        .tiptap-body-editor .ProseMirror {
          min-height: 320px;
          padding: 16px;
          outline: none;
          font-size: 15px;
          line-height: 1.75;
          color: #3a2e24;
          font-family: Georgia, 'Times New Roman', serif;
        }
        .tiptap-body-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #a89070;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .tiptap-body-editor .ProseMirror a {
          color: #8B6914;
          text-decoration: underline;
        }
        .tiptap-body-editor .ProseMirror ul,
        .tiptap-body-editor .ProseMirror ol {
          padding-left: 20px;
          margin-bottom: 12px;
        }
        .tiptap-body-editor .ProseMirror h1,
        .tiptap-body-editor .ProseMirror h2 {
          font-size: 18px;
          color: #4a3728;
          font-weight: 600;
          margin-bottom: 12px;
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#faf9f6", padding: isMobile ? "0 0 80px 0" : "32px" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>

          {/* Page header */}
          <div style={{ padding: isMobile ? "20px 16px 16px" : "0 0 32px" }}>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: "#3a2e24", marginBottom: 4 }}>
              Email Template
            </h1>
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              Edit every part of the welcome email sent to new subscribers
            </p>
          </div>

          {isMobile ? (
            /* ── Mobile layout ── */
            <div style={{ padding: "0 12px" }}>
              {/* Tab bar */}
              <div style={{ display: "flex", borderBottom: "2px solid #e0d5c5", marginBottom: 16 }}>
                {(["edit", "preview"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      background: "none",
                      border: "none",
                      borderBottom: activeTab === tab ? `2px solid ${GOLD}` : "2px solid transparent",
                      marginBottom: -2,
                      fontSize: 14,
                      fontWeight: 600,
                      color: activeTab === tab ? GOLD : "#6b7280",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {tab === "edit" ? "✏️ Edit" : "👁 Preview"}
                  </button>
                ))}
              </div>

              {activeTab === "edit" ? editorPanel : mobilePreview}
            </div>
          ) : (
            /* ── Desktop layout ── */
            <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
              <div style={{ flex: 1, maxWidth: 560 }}>
                {editorPanel}
              </div>
              <div style={{ width: 430, flexShrink: 0 }}>
                {desktopPreview}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sticky save bar */}
      {isMobile && (
        <div style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#fff",
          borderTop: "1px solid #e0d5c5",
          padding: "12px 16px",
          zIndex: 100,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}>
          {isDirty && saveStatus !== "saved" && (
            <span style={{ fontSize: 12, color: "#f59e0b", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
              <span style={{ width: 7, height: 7, background: "#f59e0b", borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
              Unsaved
            </span>
          )}
          {saveStatus === "saved" && (
            <span style={{ fontSize: 12, color: "#10b981", whiteSpace: "nowrap" }}>Saved ✓</span>
          )}
          <button
            onClick={saveTemplate}
            disabled={saving}
            style={{
              flex: 1,
              padding: "13px",
              background: GOLD,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Template"}
          </button>
        </div>
      )}
    </>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #e0d5c5" }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#3a2e24" }}>{title}</h3>
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
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 48, height: 36, border: "1px solid #e0d5c5", borderRadius: 6, cursor: "pointer", padding: 2 }} />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, padding: "6px 10px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }} />
      </div>
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 16 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
    </label>
  );
}

function TipTapButton({
  children,
  active,
  title,
  onMouseDown,
}: {
  children: React.ReactNode;
  active: boolean;
  title?: string;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onMouseDown={onMouseDown}
      title={title}
      style={{
        padding: "5px 11px",
        background: active ? GOLD : "#fff",
        color: active ? "#fff" : "#4a3728",
        border: `1px solid ${active ? GOLD : "#e0d5c5"}`,
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      {children}
    </button>
  );
}
