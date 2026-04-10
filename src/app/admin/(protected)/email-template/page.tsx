"use client";

import { useState, useEffect } from "react";

const GOLD = "#8B6914";

interface EmailTemplate {
  logoUrl: string;
  headerBgColor: string;
  cardBgColor: string;
  greetingText: string;
  greetingItalic: boolean;
  bodyParagraph1: string;
  bodyParagraph2: string;
  bulletSectionTitle: string;
  bullet1Label: string;
  bullet1Text: string;
  bullet2Label: string;
  bullet2Text: string;
  bullet3Label: string;
  bullet3Text: string;
  closingText: string;
  signatureText: string;
  signatureName: string;
  signatureSubtitle: string;
  avatarUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  instagramButtonColor: string;
  tiktokButtonColor: string;
  textColorDark: string;
  textColorMedium: string;
  textColorLight: string;
  accentColor: string;
}

export default function EmailTemplateEditor() {
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => {
    loadTemplate();
  }, []);

  useEffect(() => {
    if (template) {
      generatePreview();
    }
  }, [template]);

  async function loadTemplate() {
    try {
      const res = await fetch("/api/admin/email-template", { cache: "no-store" });
      const data = await res.json();
      if (data.template) {
        setTemplate(data.template);
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
      const res = await fetch("/api/admin/email-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      if (res.ok) {
        alert("Template saved successfully!");
      } else {
        alert("Failed to save template");
      }
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  function generatePreview() {
    if (!template) return;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:${template.headerBgColor};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${template.headerBgColor};">
    <tr>
      <td style="padding:40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">
          
          <!-- Top border -->
          <tr>
            <td style="padding-bottom:32px;">
              <div style="height:3px;background:linear-gradient(90deg,transparent,#8b5e3c,${template.accentColor},#8b5e3c,transparent);border-radius:2px;"></div>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:${template.cardBgColor};border-radius:12px;padding:40px 32px;border:1px solid rgba(139,94,60,0.12);">
              
              <!-- Logo -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align:center;padding-bottom:28px;">
                    <img src="${template.logoUrl}" alt="Artisans' Stories" width="320" height="107" style="display:block;margin:0 auto;max-width:320px;height:auto;"/>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align:center;padding-bottom:28px;">
                    <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,${template.accentColor},transparent);margin:0 auto;"></div>
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:17px;color:${template.textColorDark};line-height:1.6;padding-bottom:24px;${template.greetingItalic ? 'font-style:italic;' : ''}text-align:left;">
                    ${template.greetingText}
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;padding-bottom:16px;text-align:left;">
                    ${template.bodyParagraph1}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;padding-bottom:24px;text-align:left;">
                    ${template.bodyParagraph2}
                  </td>
                </tr>
              </table>

              <!-- Bullet list -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:16px;color:${template.textColorDark};line-height:1.6;padding-bottom:16px;text-align:left;font-weight:600;">
                    ${template.bulletSectionTitle}
                  </td>
                </tr>
                <tr>
                  <td style="padding-left:20px;padding-bottom:12px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="width:20px;vertical-align:top;padding-top:2px;"><span style="color:${template.accentColor};font-size:16px;">•</span></td>
                        <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;"><strong>${template.bullet1Label}</strong> ${template.bullet1Text}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-left:20px;padding-bottom:12px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="width:20px;vertical-align:top;padding-top:2px;"><span style="color:${template.accentColor};font-size:16px;">•</span></td>
                        <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;"><strong>${template.bullet2Label}</strong> ${template.bullet2Text}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-left:20px;padding-bottom:28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="width:20px;vertical-align:top;padding-top:2px;"><span style="color:${template.accentColor};font-size:16px;">•</span></td>
                        <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;"><strong>${template.bullet3Label}</strong> ${template.bullet3Text}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Social Buttons -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding-bottom:28px;">
                <tr>
                  <td style="text-align:center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td style="padding:0 8px;">
                          <a href="${template.instagramUrl}" style="display:inline-block;padding:12px 20px;background:${template.instagramButtonColor};color:#ffffff;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;">Follow on Instagram</a>
                        </td>
                        <td style="padding:0 8px;">
                          <a href="${template.tiktokUrl}" style="display:inline-block;padding:12px 20px;background:${template.tiktokButtonColor};color:#ffffff;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;">Follow on TikTok</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Closing -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;padding-bottom:28px;text-align:left;">
                    ${template.closingText}
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align:center;padding-bottom:24px;">
                    <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,${template.accentColor},transparent);margin:0 auto;"></div>
                  </td>
                </tr>
              </table>

              <!-- Signature -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-right:12px;vertical-align:top;">
                          <img src="${template.avatarUrl}" alt="Anna" width="48" height="48" style="border-radius:50%;display:block;border:2px solid ${template.accentColor};"/>
                        </td>
                        <td style="vertical-align:top;padding-top:4px;">
                          <div style="font-size:13px;color:${template.textColorLight};font-family:Arial,Helvetica,sans-serif;letter-spacing:0.04em;line-height:1.8;">
                            ${template.signatureText}<br/>
                            <span style="color:${template.textColorDark};font-family:Georgia,serif;font-size:18px;font-style:italic;">${template.signatureName}</span><br/>
                            <span style="color:#8a7a66;font-size:11px;">${template.signatureSubtitle}</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="text-align:center;font-size:11px;color:#b8967a;padding-top:28px;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.04em;line-height:1.8;">
              © ${new Date().getFullYear()} Artisans' Stories · El Salvador to the United States<br/>
              <a href="https://artisansstories.com" style="color:#8b5e3c;text-decoration:none;">artisansstories.com</a>
            </td>
          </tr>

          <!-- Bottom border -->
          <tr>
            <td style="padding-top:24px;">
              <div style="height:3px;background:linear-gradient(90deg,transparent,#8b5e3c,${template.accentColor},#8b5e3c,transparent);border-radius:2px;"></div>
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

  if (loading || !template) return <div className="p-8">Loading...</div>;

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
          {/* Editor */}
          <div style={{ flex: 1, maxWidth: 700 }}>
            <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, padding: 24 }}>
              
              <Section title="Logo & Header">
                <Input label="Logo URL" value={template.logoUrl} onChange={(v) => setTemplate({ ...template, logoUrl: v })} />
                <ColorPicker label="Header Background" value={template.headerBgColor} onChange={(v) => setTemplate({ ...template, headerBgColor: v })} />
                <ColorPicker label="Card Background" value={template.cardBgColor} onChange={(v) => setTemplate({ ...template, cardBgColor: v })} />
              </Section>

              <Section title="Greeting">
                <Textarea label="Greeting Text" value={template.greetingText} onChange={(v) => setTemplate({ ...template, greetingText: v })} rows={2} />
                <Checkbox label="Italic" checked={template.greetingItalic} onChange={(v) => setTemplate({ ...template, greetingItalic: v })} />
              </Section>

              <Section title="Body Paragraphs">
                <Textarea label="Paragraph 1" value={template.bodyParagraph1} onChange={(v) => setTemplate({ ...template, bodyParagraph1: v })} rows={3} />
                <Textarea label="Paragraph 2" value={template.bodyParagraph2} onChange={(v) => setTemplate({ ...template, bodyParagraph2: v })} rows={5} />
              </Section>

              <Section title="Bullet List">
                <Input label="Section Title" value={template.bulletSectionTitle} onChange={(v) => setTemplate({ ...template, bulletSectionTitle: v })} />
                <div style={{ marginTop: 16, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Bullet 1</h4>
                  <Input label="Label (bold)" value={template.bullet1Label} onChange={(v) => setTemplate({ ...template, bullet1Label: v })} />
                  <Input label="Text" value={template.bullet1Text} onChange={(v) => setTemplate({ ...template, bullet1Text: v })} />
                </div>
                <div style={{ marginTop: 12, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Bullet 2</h4>
                  <Input label="Label (bold)" value={template.bullet2Label} onChange={(v) => setTemplate({ ...template, bullet2Label: v })} />
                  <Input label="Text" value={template.bullet2Text} onChange={(v) => setTemplate({ ...template, bullet2Text: v })} />
                </div>
                <div style={{ marginTop: 12, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Bullet 3</h4>
                  <Input label="Label (bold)" value={template.bullet3Label} onChange={(v) => setTemplate({ ...template, bullet3Label: v })} />
                  <Input label="Text" value={template.bullet3Text} onChange={(v) => setTemplate({ ...template, bullet3Text: v })} />
                </div>
              </Section>

              <Section title="Social Buttons">
                <Input label="Instagram URL" value={template.instagramUrl} onChange={(v) => setTemplate({ ...template, instagramUrl: v })} />
                <ColorPicker label="Instagram Button Color" value={template.instagramButtonColor} onChange={(v) => setTemplate({ ...template, instagramButtonColor: v })} />
                <Input label="TikTok URL" value={template.tiktokUrl} onChange={(v) => setTemplate({ ...template, tiktokUrl: v })} />
                <ColorPicker label="TikTok Button Color" value={template.tiktokButtonColor} onChange={(v) => setTemplate({ ...template, tiktokButtonColor: v })} />
              </Section>

              <Section title="Closing & Signature">
                <Textarea label="Closing Text" value={template.closingText} onChange={(v) => setTemplate({ ...template, closingText: v })} rows={2} />
                <Input label="Signature Text" value={template.signatureText} onChange={(v) => setTemplate({ ...template, signatureText: v })} />
                <Input label="Signature Name" value={template.signatureName} onChange={(v) => setTemplate({ ...template, signatureName: v })} />
                <Input label="Signature Subtitle" value={template.signatureSubtitle} onChange={(v) => setTemplate({ ...template, signatureSubtitle: v })} />
                <Input label="Avatar URL" value={template.avatarUrl} onChange={(v) => setTemplate({ ...template, avatarUrl: v })} />
              </Section>

              <Section title="Colors">
                <ColorPicker label="Text Dark" value={template.textColorDark} onChange={(v) => setTemplate({ ...template, textColorDark: v })} />
                <ColorPicker label="Text Medium" value={template.textColorMedium} onChange={(v) => setTemplate({ ...template, textColorMedium: v })} />
                <ColorPicker label="Text Light" value={template.textColorLight} onChange={(v) => setTemplate({ ...template, textColorLight: v })} />
                <ColorPicker label="Accent Color" value={template.accentColor} onChange={(v) => setTemplate({ ...template, accentColor: v })} />
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
                  marginTop: 24,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>

          {/* Preview */}
          <div style={{ width: 650, flexShrink: 0 }}>
            <div style={{ position: "sticky", top: 32 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#3a2e24" }}>Live Preview</h3>
              <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: "100%", height: "800px", border: "none" }}
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

// Helper Components

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #e0d5c5" }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#3a2e24" }}>{title}</h3>
      {children}
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 14 }}
      />
    </label>
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
        style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 14, fontFamily: "inherit" }}
      />
    </label>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</span>
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
          style={{ flex: 1, padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 6, fontSize: 14, fontFamily: "monospace" }}
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
