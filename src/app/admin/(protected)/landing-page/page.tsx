"use client";

import { useState, useEffect } from "react";
import RichTextEditor from "@/components/RichTextEditor";
import SocialLinksManager from "@/components/SocialLinksManager";

const GOLD = "#8B6914";

interface SocialLink {
  platform: "facebook" | "instagram" | "x" | "tiktok" | "pinterest" | "email";
  url?: string;
  value?: string;
}

interface Settings {
  heroTitle: string;
  heroSubtitle?: string;
  heroCTA: string;
  heroImageUrl?: string;
  backgroundImageUrl?: string;
  aboutTitle: string;
  aboutContent?: string;
  aboutImageUrl?: string;
  footerText: string;
  midSectionContent?: string;
  showComingSoonBadge: boolean;
  comingSoonText: string;
  showLogo: boolean;
  showHeroImage: boolean;
  showAboutSection: boolean;
  showMidSection: boolean;
  showEmailForm: boolean;
  showSocialIcons: boolean;
  socialLinks: SocialLink[];
  emailButtonText: string;
  emailButtonColor: string;
  emailSubText: string;
}

export default function LandingPageEditor() {
  const [settings, setSettings] = useState<Settings>({
    heroTitle: "",
    heroCTA: "Join the Waitlist",
    aboutTitle: "Our Story",
    footerText: "© 2026 Artisans Stories",
    midSectionContent: "",
    showComingSoonBadge: true,
    comingSoonText: "Coming Soon",
    showLogo: true,
    showHeroImage: true,
    showAboutSection: true,
    showMidSection: true,
    showEmailForm: true,
    showSocialIcons: true,
    socialLinks: [],
    emailButtonText: "Notify Me When We Launch",
    emailButtonColor: "#8B6914",
    emailSubText: "No spam, ever · Just our launch announcement",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch("/api/admin/landing-page/settings");
      const data = await res.json();
      if (data.settings) {
        setSettings({
          ...data.settings,
          socialLinks: data.settings.socialLinks || [],
        });
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/landing-page/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        alert("Settings saved! Refresh the preview to see changes.");
        // Force iframe refresh
        const iframe = document.querySelector('iframe[title="Landing Page Preview"]') as HTMLIFrameElement;
        if (iframe) {
          iframe.src = iframe.src;
        }
      } else {
        alert("Failed to save settings");
      }
    } catch (error) {
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File, field: keyof Settings) {
    setUploading(field);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("field", field);

      const res = await fetch("/api/admin/landing-page/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.url) {
        setSettings({ ...settings, [field]: data.url });
      } else {
        alert("Upload failed");
      }
    } catch (error) {
      alert("Upload failed");
    } finally {
      setUploading(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, field: keyof Settings) {
    const file = e.target.files?.[0];
    if (file) uploadImage(file, field);
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f6", padding: "32px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#3a2e24", marginBottom: 8 }}>
            Landing Page Editor
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280" }}>
            Customize every section of your landing page
          </p>
        </div>

        <div style={{ display: "flex", gap: 32 }}>
          {/* Editor */}
          <div style={{ flex: 1 }}>
            <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, padding: 24 }}>
              
              {/* Coming Soon Badge */}
              <Section title="Coming Soon Badge">
                <Toggle
                  label="Show Badge"
                  checked={settings.showComingSoonBadge}
                  onChange={(checked) => setSettings({ ...settings, showComingSoonBadge: checked })}
                />
                {settings.showComingSoonBadge && (
                  <label style={{ display: "block", marginTop: 16 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Badge Text</span>
                    <input
                      type="text"
                      value={settings.comingSoonText}
                      onChange={(e) => setSettings({ ...settings, comingSoonText: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                    />
                  </label>
                )}
              </Section>

              {/* Logo */}
              <Section title="Logo">
                <Toggle
                  label="Show Logo"
                  checked={settings.showLogo}
                  onChange={(checked) => setSettings({ ...settings, showLogo: checked })}
                />
              </Section>

              {/* Profile Image */}
              <Section title="Profile Image (Hero)">
                <Toggle
                  label="Show Image"
                  checked={settings.showHeroImage}
                  onChange={(checked) => setSettings({ ...settings, showHeroImage: checked })}
                />
                {settings.showHeroImage && (
                  <ImageUpload
                    label="Hero Image"
                    currentUrl={settings.heroImageUrl}
                    uploading={uploading === "heroImageUrl"}
                    onChange={(e) => handleFileChange(e, "heroImageUrl")}
                  />
                )}
              </Section>

              {/* Background Image */}
              <Section title="Background Image">
                <ImageUpload
                  label="Background"
                  currentUrl={settings.backgroundImageUrl}
                  uploading={uploading === "backgroundImageUrl"}
                  onChange={(e) => handleFileChange(e, "backgroundImageUrl")}
                />
              </Section>

              {/* About Section */}
              <Section title="About Section">
                <Toggle
                  label="Show Section"
                  checked={settings.showAboutSection}
                  onChange={(checked) => setSettings({ ...settings, showAboutSection: checked })}
                />
                {settings.showAboutSection && (
                  <>
                    <label style={{ display: "block", marginTop: 16, marginBottom: 16 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Section Title</span>
                      <input
                        type="text"
                        value={settings.aboutTitle}
                        onChange={(e) => setSettings({ ...settings, aboutTitle: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                      />
                    </label>
                    <div style={{ marginBottom: 16 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Content</span>
                      <RichTextEditor
                        content={settings.aboutContent || ""}
                        onChange={(html) => setSettings({ ...settings, aboutContent: html })}
                        placeholder="Enter about content..."
                        minHeight={150}
                      />
                    </div>
                    <ImageUpload
                      label="About Image"
                      currentUrl={settings.aboutImageUrl}
                      uploading={uploading === "aboutImageUrl"}
                      onChange={(e) => handleFileChange(e, "aboutImageUrl")}
                    />
                  </>
                )}
              </Section>

              {/* Hero Title */}
              <Section title="Hero Title">
                <label style={{ display: "block", marginBottom: 16 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Title</span>
                  <input
                    type="text"
                    value={settings.heroTitle}
                    onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                  />
                </label>
                <div style={{ marginBottom: 16 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Subtitle (Optional)</span>
                  <RichTextEditor
                    content={settings.heroSubtitle || ""}
                    onChange={(html) => setSettings({ ...settings, heroSubtitle: html })}
                    placeholder="Enter subtitle..."
                    minHeight={80}
                  />
                </div>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>CTA Button Text</span>
                  <input
                    type="text"
                    value={settings.heroCTA}
                    onChange={(e) => setSettings({ ...settings, heroCTA: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                  />
                </label>
              </Section>

              {/* Mid Section (3 paragraphs) */}
              <Section title="Mid-Page Content">
                <Toggle
                  label="Show Section"
                  checked={settings.showMidSection}
                  onChange={(checked) => setSettings({ ...settings, showMidSection: checked })}
                />
                {settings.showMidSection && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Content</span>
                    <RichTextEditor
                      content={settings.midSectionContent || ""}
                      onChange={(html) => setSettings({ ...settings, midSectionContent: html })}
                      placeholder="Be among the first to join and be part of the journey..."
                      minHeight={200}
                    />
                  </div>
                )}
              </Section>

              {/* Social Icons */}
              <Section title="Social Links">
                <Toggle
                  label="Show Social Icons"
                  checked={settings.showSocialIcons}
                  onChange={(checked) => setSettings({ ...settings, showSocialIcons: checked })}
                />
                {settings.showSocialIcons && (
                  <div style={{ marginTop: 16 }}>
                    <SocialLinksManager
                      links={settings.socialLinks}
                      onChange={(links) => setSettings({ ...settings, socialLinks: links })}
                    />
                  </div>
                )}
              </Section>

              {/* Email Form */}
              <Section title="Email Signup Form">
                <Toggle
                  label="Show Form"
                  checked={settings.showEmailForm}
                  onChange={(checked) => setSettings({ ...settings, showEmailForm: checked })}
                />
                {settings.showEmailForm && (
                  <>
                    <label style={{ display: "block", marginTop: 16, marginBottom: 16 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Button Label</span>
                      <input
                        type="text"
                        value={settings.emailButtonText}
                        onChange={(e) => setSettings({ ...settings, emailButtonText: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                      />
                    </label>
                    <label style={{ display: "block", marginBottom: 16 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Button Color</span>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <input
                          type="color"
                          value={settings.emailButtonColor}
                          onChange={(e) => setSettings({ ...settings, emailButtonColor: e.target.value })}
                          style={{ width: 60, height: 40, border: "1px solid #e0d5c5", borderRadius: 6, cursor: "pointer" }}
                        />
                        <input
                          type="text"
                          value={settings.emailButtonColor}
                          onChange={(e) => setSettings({ ...settings, emailButtonColor: e.target.value })}
                          style={{ flex: 1, padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14, fontFamily: "monospace" }}
                        />
                      </div>
                    </label>
                    <label style={{ display: "block" }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Message Below Button</span>
                      <input
                        type="text"
                        value={settings.emailSubText}
                        onChange={(e) => setSettings({ ...settings, emailSubText: e.target.value })}
                        placeholder="No spam, ever · Just our launch announcement"
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                      />
                    </label>
                  </>
                )}
              </Section>

              {/* Footer */}
              <Section title="Footer">
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Footer Text</span>
                  <input
                    type="text"
                    value={settings.footerText}
                    onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                  />
                </label>
              </Section>

              {/* Save Button */}
              <button
                onClick={saveSettings}
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
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          {/* Live Preview */}
          <div style={{ width: 480, flexShrink: 0 }}>
            <div style={{ position: "sticky", top: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#3a2e24", margin: 0 }}>Live Preview</h3>
                <button
                  onClick={() => {
                    const iframe = document.querySelector('iframe[title="Landing Page Preview"]') as HTMLIFrameElement;
                    if (iframe) iframe.src = iframe.src;
                  }}
                  style={{
                    padding: "6px 12px",
                    background: "#fff",
                    border: `1px solid ${GOLD}`,
                    borderRadius: 6,
                    color: GOLD,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ↻ Refresh
                </button>
              </div>
              <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                <div style={{ padding: "20px", background: "#fff" }}>
                  <iframe
                    src="/"
                    style={{ width: "100%", height: 600, border: "1px solid #e0e0e0", borderRadius: 8 }}
                    title="Landing Page Preview"
                  />
                </div>
              </div>
              <p style={{ fontSize: 11, color: "#6b7280", marginTop: 8, textAlign: "center" }}>
                Preview updates after saving. Refresh preview to see changes.
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

function ImageUpload({
  label,
  currentUrl,
  uploading,
  onChange,
}: {
  label: string;
  currentUrl?: string;
  uploading: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{label}</span>
      {currentUrl && (
        <div style={{ marginBottom: 8 }}>
          <img src={currentUrl} alt={label} style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, marginBottom: 6 }} />
          <div style={{ fontSize: 12, color: "#6b7280", wordBreak: "break-all" }}>
            Current: {currentUrl.split("/").pop()}
          </div>
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
