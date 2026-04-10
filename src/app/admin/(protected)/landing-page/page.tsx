"use client";

import { useState, useEffect } from "react";

const GOLD = "#8B6914";

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
}

export default function LandingPageEditor() {
  const [settings, setSettings] = useState<Settings>({
    heroTitle: "",
    heroCTA: "Join the Waitlist",
    aboutTitle: "Our Story",
    footerText: "© 2026 Artisans Stories",
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
      if (data.settings) setSettings(data.settings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await fetch("/api/admin/landing-page/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      alert("Settings saved!");
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
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#3a2e24", marginBottom: 8 }}>
            Landing Page Editor
          </h1>
          <p style={{ color: "#9a876e", fontSize: 14 }}>Customize every section of your landing page</p>
        </div>

        <div style={{ display: "flex", gap: 32 }}>
          {/* Editor */}
          <div style={{ flex: 1 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: GOLD }}>Hero Section</h2>

              <label style={{ display: "block", marginBottom: 16 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Hero Title</span>
                <input
                  type="text"
                  value={settings.heroTitle}
                  onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 16 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Hero Subtitle</span>
                <textarea
                  value={settings.heroSubtitle || ""}
                  onChange={(e) => setSettings({ ...settings, heroSubtitle: e.target.value })}
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 16 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>CTA Button Text</span>
                <input
                  type="text"
                  value={settings.heroCTA}
                  onChange={(e) => setSettings({ ...settings, heroCTA: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 16 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Hero Image</span>
                {settings.heroImageUrl && (
                  <img src={settings.heroImageUrl} alt="Hero" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, "heroImageUrl")}
                  disabled={uploading === "heroImageUrl"}
                  style={{ fontSize: 14 }}
                />
                {uploading === "heroImageUrl" && <span style={{ fontSize: 12, color: GOLD }}>Uploading...</span>}
              </label>

              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Background Image</span>
                {settings.backgroundImageUrl && (
                  <img src={settings.backgroundImageUrl} alt="Background" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, "backgroundImageUrl")}
                  disabled={uploading === "backgroundImageUrl"}
                  style={{ fontSize: 14 }}
                />
                {uploading === "backgroundImageUrl" && <span style={{ fontSize: 12, color: GOLD }}>Uploading...</span>}
              </label>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: GOLD }}>About Section</h2>

              <label style={{ display: "block", marginBottom: 16 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Section Title</span>
                <input
                  type="text"
                  value={settings.aboutTitle}
                  onChange={(e) => setSettings({ ...settings, aboutTitle: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 16 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Content</span>
                <textarea
                  value={settings.aboutContent || ""}
                  onChange={(e) => setSettings({ ...settings, aboutContent: e.target.value })}
                  rows={6}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                />
              </label>

              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Image</span>
                {settings.aboutImageUrl && (
                  <img src={settings.aboutImageUrl} alt="About" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, "aboutImageUrl")}
                  disabled={uploading === "aboutImageUrl"}
                  style={{ fontSize: 14 }}
                />
                {uploading === "aboutImageUrl" && <span style={{ fontSize: 12, color: GOLD }}>Uploading...</span>}
              </label>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: GOLD }}>Footer</h2>

              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Footer Text</span>
                <input
                  type="text"
                  value={settings.footerText}
                  onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0d5c5", borderRadius: 8, fontSize: 14 }}
                />
              </label>
            </div>

            <button
              onClick={saveSettings}
              disabled={saving}
              style={{
                marginTop: 20,
                padding: "12px 24px",
                background: GOLD,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>

          {/* Live Preview */}
          <div style={{ width: 400 }}>
            <div style={{ position: "sticky", top: 32 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#3a2e24" }}>Live Preview</h3>
              <div style={{ background: "#fff", border: "1px solid #e0d5c5", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                <iframe
                  src="/"
                  style={{ width: "100%", height: 600, border: "none" }}
                  title="Landing Page Preview"
                />
              </div>
              <p style={{ fontSize: 12, color: "#9a876e", marginTop: 8 }}>
                Preview updates after saving. Refresh preview to see changes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
