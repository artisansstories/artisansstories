"use client";

import { useState, useEffect } from "react";
import RichTextEditor from "@/components/RichTextEditor";

const GOLD = "#8B6914";

interface SocialLink {
  platform: "facebook" | "instagram" | "x" | "tiktok" | "email";
  url?: string;
  value?: string;
}

interface EmailTemplate {
  id: string;
  templateName: string;
  subject: string;
  preheader?: string;
  logoUrl?: string;
  headerBgColor: string;
  bodyBgColor: string;
  accentColor: string;
  iconType: string;
  iconUrl?: string;
  headlineText?: string;
  bodyContent?: string;
  ctaText?: string;
  ctaUrl?: string;
  ctaBgColor: string;
  ctaTextColor: string;
  footerContent?: string;
  socialLinks: SocialLink[];
  showIcon: boolean;
  showCTA: boolean;
  showSocialLinks: boolean;
}

const ICON_OPTIONS = [
  { id: "flag-el-salvador", label: "🇸🇻 El Salvador Flag" },
  { id: "envelope", label: "✉️ Envelope" },
  { id: "heart", label: "❤️ Heart" },
  { id: "star", label: "⭐ Star" },
  { id: "sparkles", label: "✨ Sparkles" },
  { id: "gift", label: "🎁 Gift" },
  { id: "custom", label: "🖼️ Custom Image (Upload)" },
];

export default function EmailTemplateEditor() {
  const [template, setTemplate] = useState<EmailTemplate>({
    id: "welcome",
    templateName: "Welcome Email",
    subject: "",
    headerBgColor: GOLD,
    bodyBgColor: "#faf9f6",
    accentColor: GOLD,
    iconType: "flag-el-salvador",
    ctaBgColor: GOLD,
    ctaTextColor: "#ffffff",
    socialLinks: [],
    showIcon: true,
    showCTA: true,
    showSocialLinks: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => {
    loadTemplate();
  }, []);

  useEffect(() => {
    generatePreview();
  }, [template]);

  async function loadTemplate() {
    try {
      const res = await fetch("/api/admin/email-templates/welcome");
      const data = await res.json();
      if (data.template) {
        setTemplate({
          ...data.template,
          socialLinks: data.template.socialLinks || [],
        });
      }
    } catch (error) {
      console.error("Failed to load template:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    setSaving(true);
    try {
      await fetch("/api/admin/email-templates/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      alert("Template saved!");
    } catch (error) {
      alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File, field: string) {
    setUploading(field);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("field", field);

      const res = await fetch("/api/admin/email-templates/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.url) {
        setTemplate({ ...template, [field]: data.url });
      } else {
        alert("Upload failed");
      }
    } catch (error) {
      alert("Upload failed");
    } finally {
      setUploading(null);
    }
  }

  function generatePreview() {
    // Generate HTML email preview
    const iconEmoji = template.showIcon
      ? template.iconType === "custom" && template.iconUrl
        ? `<img src="${template.iconUrl}" alt="Icon" style="width: 48px; height: 48px; margin-bottom: 16px;" />`
        : ICON_OPTIONS.find((i) => i.id === template.iconType)?.label.split(" ")[0] || "✉️"
      : "";

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${template.bodyBgColor};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background: ${template.headerBgColor}; padding: 32px 24px; text-align: center;">
              ${template.logoUrl ? `<img src="${template.logoUrl}" alt="Logo" style="max-width: 200px; height: auto; margin-bottom: 16px;" />` : ""}
              ${template.showIcon ? `<div style="font-size: 48px; margin-bottom: 8px;">${iconEmoji}</div>` : ""}
              ${template.headlineText ? `<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${template.headlineText}</h1>` : ""}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 24px;">
              ${template.bodyContent || "<p>Email body content goes here.</p>"}
            </td>
          </tr>
          <!-- CTA -->
          ${
            template.showCTA && template.ctaText
              ? `<tr>
            <td style="padding: 0 24px 32px 24px; text-align: center;">
              <a href="${template.ctaUrl || "#"}" style="display: inline-block; padding: 14px 32px; background: ${template.ctaBgColor}; color: ${template.ctaTextColor}; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">${template.ctaText}</a>
            </td>
          </tr>`
              : ""
          }
          <!-- Footer -->
          <tr>
            <td style="padding: 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center; font-size: 13px; color: #6b7280;">
              ${template.footerContent || ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
    setPreviewHtml(html);
  }

  async function sendTestEmail() {
    const email = prompt("Enter email address to send test:");
    if (!email) return;
    
    try {
      await fetch("/api/admin/email-templates/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, templateId: template.id }),
      });
      alert(`Test email sent to ${email}!`);
    } catch (error) {
      alert("Failed to send test email");
    }
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f6", padding: "32px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#3a2e24", marginBottom: 8 }}>
            Email Template Editor
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280" }}>
            Customize the welcome email sent to new subscribers
          </p>
        </div>

        <div style={{ display: "flex", gap: 32 }}>
          {/* Editor */}
          <div style={{ flex: 1 }}>
            <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, padding: 24 }}>
              {/* Subject Line */}
              <Section title="Email Subject">
                <label style={{ display: "block", marginBottom: 16 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Subject Line</span>
                  <input
                    type="text"
                    value={template.subject}
                    onChange={(e) => setTemplate({ ...template, subject: e.target.value })}
                    placeholder="Welcome to Artisans' Stories! 🎉"
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                  />
                </label>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Preheader Text (optional)</span>
                  <input
                    type="text"
                    value={template.preheader || ""}
                    onChange={(e) => setTemplate({ ...template, preheader: e.target.value })}
                    placeholder="Preview text shown in inbox"
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                  />
                </label>
              </Section>

              {/* Colors */}
              <Section title="Colors">
                <ColorPicker
                  label="Header Background"
                  value={template.headerBgColor}
                  onChange={(color) => setTemplate({ ...template, headerBgColor: color })}
                />
                <ColorPicker
                  label="Body Background"
                  value={template.bodyBgColor}
                  onChange={(color) => setTemplate({ ...template, bodyBgColor: color })}
                />
                <ColorPicker
                  label="Accent Color"
                  value={template.accentColor}
                  onChange={(color) => setTemplate({ ...template, accentColor: color })}
                />
              </Section>

              {/* Logo */}
              <Section title="Logo">
                <ImageUpload
                  label="Header Logo"
                  currentUrl={template.logoUrl}
                  uploading={uploading === "logoUrl"}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage(file, "logoUrl");
                  }}
                  onRemove={() => setTemplate({ ...template, logoUrl: undefined })}
                />
              </Section>

              {/* Icon */}
              <Section title="Icon">
                <Toggle
                  label="Show Icon"
                  checked={template.showIcon}
                  onChange={(checked) => setTemplate({ ...template, showIcon: checked })}
                />
                {template.showIcon && (
                  <>
                    <label style={{ display: "block", marginTop: 16, marginBottom: 16 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Icon Type</span>
                      <select
                        value={template.iconType}
                        onChange={(e) => setTemplate({ ...template, iconType: e.target.value })}
                        style={{ width: "100%", padding: "10px 14px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                      >
                        {ICON_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {template.iconType === "custom" && (
                      <ImageUpload
                        label="Custom Icon"
                        currentUrl={template.iconUrl}
                        uploading={uploading === "iconUrl"}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadImage(file, "iconUrl");
                        }}
                        onRemove={() => setTemplate({ ...template, iconUrl: undefined })}
                      />
                    )}
                  </>
                )}
              </Section>

              {/* Headline */}
              <Section title="Headline">
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Headline Text</span>
                  <input
                    type="text"
                    value={template.headlineText || ""}
                    onChange={(e) => setTemplate({ ...template, headlineText: e.target.value })}
                    placeholder="Thank you for joining!"
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                  />
                </label>
              </Section>

              {/* Body Content */}
              <Section title="Email Body">
                <RichTextEditor
                  content={template.bodyContent || ""}
                  onChange={(html) => setTemplate({ ...template, bodyContent: html })}
                  placeholder="Write your email message here..."
                  minHeight={200}
                />
              </Section>

              {/* CTA Button */}
              <Section title="Call-to-Action Button">
                <Toggle
                  label="Show CTA Button"
                  checked={template.showCTA}
                  onChange={(checked) => setTemplate({ ...template, showCTA: checked })}
                />
                {template.showCTA && (
                  <>
                    <label style={{ display: "block", marginTop: 16, marginBottom: 16 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Button Text</span>
                      <input
                        type="text"
                        value={template.ctaText || ""}
                        onChange={(e) => setTemplate({ ...template, ctaText: e.target.value })}
                        placeholder="Visit Our Website"
                        style={{ width: "100%", padding: "10px 14px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                      />
                    </label>
                    <label style={{ display: "block", marginBottom: 16 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Button URL</span>
                      <input
                        type="url"
                        value={template.ctaUrl || ""}
                        onChange={(e) => setTemplate({ ...template, ctaUrl: e.target.value })}
                        placeholder="https://artisansstories.com"
                        style={{ width: "100%", padding: "10px 14px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                      />
                    </label>
                    <ColorPicker
                      label="Button Background"
                      value={template.ctaBgColor}
                      onChange={(color) => setTemplate({ ...template, ctaBgColor: color })}
                    />
                    <ColorPicker
                      label="Button Text Color"
                      value={template.ctaTextColor}
                      onChange={(color) => setTemplate({ ...template, ctaTextColor: color })}
                    />
                  </>
                )}
              </Section>

              {/* Footer */}
              <Section title="Footer">
                <RichTextEditor
                  content={template.footerContent || ""}
                  onChange={(html) => setTemplate({ ...template, footerContent: html })}
                  placeholder="Footer text and legal copy..."
                  minHeight={120}
                />
              </Section>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
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
                <button
                  onClick={sendTestEmail}
                  style={{
                    padding: "14px 24px",
                    background: "#fff",
                    color: GOLD,
                    border: `2px solid ${GOLD}`,
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Send Test Email
                </button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={{ width: 480, flexShrink: 0 }}>
            <div style={{ position: "sticky", top: 32 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#3a2e24" }}>Live Preview</h3>
              <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: "100%", height: 700, border: "none" }}
                  title="Email Preview"
                />
              </div>
              <p style={{ fontSize: 11, color: "#6b7280", marginTop: 8, textAlign: "center" }}>
                Live preview updates as you edit
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #e0d5c5" }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#3a2e24" }}>{title}</h3>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, cursor: "pointer" }}
      />
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
    </label>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{label}</span>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 60, height: 40, border: "1px solid #e0d5c5", borderRadius: 6, cursor: "pointer" }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14, fontFamily: "monospace" }}
        />
      </div>
    </label>
  );
}

function ImageUpload({
  label,
  currentUrl,
  uploading,
  onChange,
  onRemove,
}: {
  label: string;
  currentUrl?: string;
  uploading: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove?: () => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{label}</span>
      {currentUrl && (
        <div style={{ marginBottom: 8 }}>
          <img src={currentUrl} alt={label} style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain", borderRadius: 8, marginBottom: 6, background: "#f9fafb", padding: 8 }} />
          <div style={{ fontSize: 12, color: "#6b7280", wordBreak: "break-all", marginBottom: 6 }}>
            Current: {currentUrl.split("/").pop()}
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
            >
              Remove
            </button>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ padding: "8px 16px", background: GOLD, color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
          {currentUrl ? "Change Image" : "Upload Image"}
          <input type="file" accept="image/*" onChange={onChange} disabled={uploading} style={{ display: "none" }} />
        </label>
        {uploading && <span style={{ fontSize: 12, color: GOLD }}>Uploading...</span>}
      </div>
    </div>
  );
}
