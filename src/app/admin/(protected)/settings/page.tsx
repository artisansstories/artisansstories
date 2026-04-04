"use client";

import { useEffect, useState } from "react";

interface StoreSettings {
  id: string;
  storeName: string;
  storeDescription: string | null;
  storeLogo: string | null;
  storeFavicon: string | null;
  primaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  contactEmail: string;
  contactPhone: string | null;
  returnPolicyDays: number;
  returnPolicyText: string | null;
  storeEnabled: boolean;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  facebookUrl: string | null;
  pinterestUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  googleAnalyticsId: string | null;
  lowStockThreshold: number;
  lowStockAlertEmail: string | null;
  orderNotificationEmail: string | null;
}

const SECTION_STYLE: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ede8df",
  borderRadius: 12,
  padding: "24px",
  marginBottom: 24,
};

const SECTION_TITLE: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 20,
  fontWeight: 600,
  color: "#3a2e24",
  margin: "0 0 20px",
  paddingBottom: 12,
  borderBottom: "1px solid #f0ebe0",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  fontWeight: 500,
  color: "#5a4a38",
  marginBottom: 6,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #e0d5c5",
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  color: "#3a2e24",
  background: "#fefcf9",
  outline: "none",
  boxSizing: "border-box",
};

const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  minHeight: 100,
  resize: "vertical",
};

const FIELD_GROUP: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginBottom: 16,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Partial<StoreSettings>>({
    storeName: "",
    storeDescription: "",
    contactEmail: "",
    contactPhone: "",
    primaryColor: "#8B6914",
    accentColor: "#C9A84C",
    fontHeading: "Cormorant Garamond",
    fontBody: "Inter",
    instagramUrl: "",
    tiktokUrl: "",
    facebookUrl: "",
    pinterestUrl: "",
    storeEnabled: false,
    returnPolicyDays: 30,
    returnPolicyText: "",
    orderNotificationEmail: "",
    lowStockAlertEmail: "",
    lowStockThreshold: 5,
    metaTitle: "",
    metaDescription: "",
    googleAnalyticsId: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setSettings(data);
      } catch {
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function update(field: keyof StoreSettings, value: string | number | boolean) {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setSettings(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(field: "storeLogo" | "storeFavicon", file: File) {
    const setUploading = field === "storeLogo" ? setUploadingLogo : setUploadingFavicon;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      update(field, data.url);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: #8B6914 !important; box-shadow: 0 0 0 3px rgba(139,105,20,0.1); }
        @media (max-width: 600px) { .settings-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: "#3a2e24", margin: "0 0 6px" }}>Settings</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#9a876e", margin: 0 }}>Manage your store configuration</p>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#dc2626", margin: 0 }}>{error}</p>
        </div>
      )}

      {/* 1. General */}
      <div style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>General</h2>
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL_STYLE}>Store Name</label>
          <input style={INPUT_STYLE} value={settings.storeName ?? ""} onChange={(e) => update("storeName", e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL_STYLE}>Store Description</label>
          <textarea style={TEXTAREA_STYLE} value={settings.storeDescription ?? ""} onChange={(e) => update("storeDescription", e.target.value)} />
        </div>
        <div style={{ ...FIELD_GROUP }} className="settings-grid">
          <div>
            <label style={LABEL_STYLE}>Contact Email</label>
            <input style={INPUT_STYLE} type="email" value={settings.contactEmail ?? ""} onChange={(e) => update("contactEmail", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Contact Phone</label>
            <input style={INPUT_STYLE} type="tel" value={settings.contactPhone ?? ""} onChange={(e) => update("contactPhone", e.target.value)} />
          </div>
        </div>
      </div>

      {/* 2. Branding */}
      <div style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>Branding</h2>

        <div style={{ ...FIELD_GROUP }} className="settings-grid">
          <div>
            <label style={LABEL_STYLE}>Logo</label>
            {settings.storeLogo && (
              <img src={settings.storeLogo} alt="Logo" style={{ height: 40, marginBottom: 8, display: "block", borderRadius: 4, border: "1px solid #ede8df" }} />
            )}
            <input
              type="file"
              accept="image/*"
              style={{ ...INPUT_STYLE, padding: "8px" }}
              disabled={uploadingLogo}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload("storeLogo", file);
              }}
            />
            {uploadingLogo && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e", margin: "4px 0 0" }}>Uploading...</p>}
          </div>
          <div>
            <label style={LABEL_STYLE}>Favicon</label>
            {settings.storeFavicon && (
              <img src={settings.storeFavicon} alt="Favicon" style={{ height: 32, marginBottom: 8, display: "block", borderRadius: 4, border: "1px solid #ede8df" }} />
            )}
            <input
              type="file"
              accept="image/*"
              style={{ ...INPUT_STYLE, padding: "8px" }}
              disabled={uploadingFavicon}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload("storeFavicon", file);
              }}
            />
            {uploadingFavicon && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#9a876e", margin: "4px 0 0" }}>Uploading...</p>}
          </div>
        </div>

        <div style={{ ...FIELD_GROUP }} className="settings-grid">
          <div>
            <label style={LABEL_STYLE}>Primary Color</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={settings.primaryColor ?? "#8B6914"} onChange={(e) => update("primaryColor", e.target.value)} style={{ width: 44, height: 40, borderRadius: 8, border: "1px solid #e0d5c5", cursor: "pointer", padding: 2 }} />
              <input style={{ ...INPUT_STYLE, flex: 1 }} value={settings.primaryColor ?? ""} onChange={(e) => update("primaryColor", e.target.value)} maxLength={7} />
            </div>
          </div>
          <div>
            <label style={LABEL_STYLE}>Accent Color</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={settings.accentColor ?? "#C9A84C"} onChange={(e) => update("accentColor", e.target.value)} style={{ width: 44, height: 40, borderRadius: 8, border: "1px solid #e0d5c5", cursor: "pointer", padding: 2 }} />
              <input style={{ ...INPUT_STYLE, flex: 1 }} value={settings.accentColor ?? ""} onChange={(e) => update("accentColor", e.target.value)} maxLength={7} />
            </div>
          </div>
        </div>

        <div style={{ ...FIELD_GROUP }} className="settings-grid">
          <div>
            <label style={LABEL_STYLE}>Heading Font</label>
            <select style={{ ...INPUT_STYLE }} value={settings.fontHeading ?? "Cormorant Garamond"} onChange={(e) => update("fontHeading", e.target.value)}>
              <option>Cormorant Garamond</option>
              <option>Playfair Display</option>
              <option>Lora</option>
              <option>Georgia</option>
            </select>
          </div>
          <div>
            <label style={LABEL_STYLE}>Body Font</label>
            <select style={{ ...INPUT_STYLE }} value={settings.fontBody ?? "Inter"} onChange={(e) => update("fontBody", e.target.value)}>
              <option>Inter</option>
              <option>Roboto</option>
              <option>Open Sans</option>
              <option>System</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Social Links */}
      <div style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>Social Links</h2>
        <div style={{ ...FIELD_GROUP }} className="settings-grid">
          <div>
            <label style={LABEL_STYLE}>Instagram URL</label>
            <input style={INPUT_STYLE} type="url" placeholder="https://instagram.com/..." value={settings.instagramUrl ?? ""} onChange={(e) => update("instagramUrl", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>TikTok URL</label>
            <input style={INPUT_STYLE} type="url" placeholder="https://tiktok.com/@..." value={settings.tiktokUrl ?? ""} onChange={(e) => update("tiktokUrl", e.target.value)} />
          </div>
        </div>
        <div style={{ ...FIELD_GROUP }} className="settings-grid">
          <div>
            <label style={LABEL_STYLE}>Facebook URL</label>
            <input style={INPUT_STYLE} type="url" placeholder="https://facebook.com/..." value={settings.facebookUrl ?? ""} onChange={(e) => update("facebookUrl", e.target.value)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Pinterest URL</label>
            <input style={INPUT_STYLE} type="url" placeholder="https://pinterest.com/..." value={settings.pinterestUrl ?? ""} onChange={(e) => update("pinterestUrl", e.target.value)} />
          </div>
        </div>
      </div>

      {/* 4. Store Visibility */}
      <div style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>Store Visibility</h2>
        <div
          onClick={() => update("storeEnabled", !settings.storeEnabled)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderRadius: 12,
            border: `2px solid ${settings.storeEnabled ? "#16a34a" : "#d97706"}`,
            background: settings.storeEnabled ? "#f0fdf4" : "#fffbeb",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          <div>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: settings.storeEnabled ? "#15803d" : "#b45309", margin: "0 0 4px" }}>
              {settings.storeEnabled ? "Store is LIVE" : "Store is in Coming Soon mode"}
            </p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: settings.storeEnabled ? "#16a34a" : "#d97706", margin: 0 }}>
              {settings.storeEnabled
                ? "Your store is live at artisansstories.com"
                : "Visitors see the coming soon page"}
            </p>
          </div>
          <div style={{
            width: 52,
            height: 28,
            borderRadius: 14,
            background: settings.storeEnabled ? "#16a34a" : "#d1d5db",
            position: "relative",
            transition: "background 0.2s",
            flexShrink: 0,
          }}>
            <div style={{
              position: "absolute",
              top: 3,
              left: settings.storeEnabled ? 27 : 3,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </div>
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: settings.storeEnabled ? "#16a34a" : "#d97706" }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: settings.storeEnabled ? "#15803d" : "#b45309" }}>
            {settings.storeEnabled ? "Online" : "Coming Soon"}
          </span>
        </div>
      </div>

      {/* 5. Returns Policy */}
      <div style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>Returns Policy</h2>
        <div style={{ marginBottom: 16, maxWidth: 200 }}>
          <label style={LABEL_STYLE}>Return Window (days)</label>
          <input style={INPUT_STYLE} type="number" min={0} max={365} value={settings.returnPolicyDays ?? 30} onChange={(e) => update("returnPolicyDays", parseInt(e.target.value, 10) || 30)} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Policy Text</label>
          <textarea style={{ ...TEXTAREA_STYLE, minHeight: 140 }} value={settings.returnPolicyText ?? ""} onChange={(e) => update("returnPolicyText", e.target.value)} placeholder="Describe your return policy..." />
        </div>
      </div>

      {/* 6. Notifications */}
      <div style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>Notifications</h2>
        <div style={{ ...FIELD_GROUP }} className="settings-grid">
          <div>
            <label style={LABEL_STYLE}>Order Notification Email</label>
            <input style={INPUT_STYLE} type="email" value={settings.orderNotificationEmail ?? ""} onChange={(e) => update("orderNotificationEmail", e.target.value)} placeholder="orders@yourdomain.com" />
          </div>
          <div>
            <label style={LABEL_STYLE}>Low Stock Alert Email</label>
            <input style={INPUT_STYLE} type="email" value={settings.lowStockAlertEmail ?? ""} onChange={(e) => update("lowStockAlertEmail", e.target.value)} placeholder="alerts@yourdomain.com" />
          </div>
        </div>
        <div style={{ maxWidth: 200 }}>
          <label style={LABEL_STYLE}>Low Stock Threshold</label>
          <input style={INPUT_STYLE} type="number" min={0} max={1000} value={settings.lowStockThreshold ?? 5} onChange={(e) => update("lowStockThreshold", parseInt(e.target.value, 10) || 5)} />
        </div>
      </div>

      {/* 7. SEO */}
      <div style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>SEO</h2>
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL_STYLE}>Default Meta Title</label>
          <input style={INPUT_STYLE} value={settings.metaTitle ?? ""} onChange={(e) => update("metaTitle", e.target.value)} placeholder="Artisans' Stories — Handcrafted in El Salvador" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL_STYLE}>Default Meta Description</label>
          <textarea style={TEXTAREA_STYLE} value={settings.metaDescription ?? ""} onChange={(e) => update("metaDescription", e.target.value)} placeholder="Discover handcrafted artisan goods from El Salvador..." />
        </div>
        <div>
          <label style={LABEL_STYLE}>Google Analytics ID</label>
          <input style={INPUT_STYLE} value={settings.googleAnalyticsId ?? ""} onChange={(e) => update("googleAnalyticsId", e.target.value)} placeholder="G-XXXXXXXXXX" />
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 40 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "12px 32px",
            borderRadius: 8,
            border: "none",
            background: saving ? "#c9b07a" : "#8B6914",
            color: "#fff",
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "#7a5c12"; }}
          onMouseLeave={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "#8B6914"; }}
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {saved && (
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#16a34a", fontWeight: 500 }}>
            Saved successfully
          </span>
        )}
      </div>
    </div>
  );
}
