"use client";

import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import Image from "next/image";

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: "#faf9f6",
  card: "#ffffff",
  border: "#e0d5c5",
  gold: "#8B6914",
  goldLight: "#f5edd6",
  textDark: "#3a2e24",
  textMid: "#6b5540",
  textLight: "#9a876e",
  success: "#4a9a4a",
  danger: "#dc2626",
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface Link {
  id: string;
  title: string;
  url: string;
  description?: string;
  icon?: string;
  isEnabled: boolean;
  sortOrder: number;
  clicks: number;
}

interface Settings {
  isEnabled: boolean;
  profileName: string;
  profileBio?: string;
  profileImageUrl?: string;
  customSlug?: string;
  backgroundColor: string;
  buttonColor: string;
  textColor: string;
}

// ─── Toggle Switch ───────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: 44,
        height: 24,
        borderRadius: 12,
        padding: 2,
        background: checked ? C.gold : "#d1c4b0",
        border: "none",
        cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "block",
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          transform: checked ? "translateX(20px)" : "translateX(0)",
          transition: "transform 0.2s",
        }}
      />
    </button>
  );
}

// ─── Color Swatch Input ──────────────────────────────────────────────────────
function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", background: C.card }}>
        <label style={{ display: "block", width: 22, height: 22, borderRadius: 6, border: `2px solid ${C.border}`, background: value, cursor: "pointer", flexShrink: 0 }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ border: "none", outline: "none", fontSize: 12, fontFamily: "monospace", color: C.textMid, background: "transparent", width: 72 }}
        />
      </div>
    </div>
  );
}

// ─── Link Form ───────────────────────────────────────────────────────────────
function LinkForm({
  link,
  onSave,
  onCancel,
}: {
  link?: Link;
  onSave: (link: Partial<Link>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(link?.title ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [description, setDescription] = useState(link?.description ?? "");
  const [icon, setIcon] = useState(link?.icon ?? "");
  const [isEnabled, setIsEnabled] = useState(link?.isEnabled ?? true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ id: link?.id, title, url, description: description || undefined, icon: icon || undefined, isEnabled });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 14,
    color: C.textDark,
    background: C.card,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: C.goldLight,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 4 }}>Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} required placeholder="e.g. Shop" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 4 }}>Icon / Emoji</label>
            <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} style={inputStyle} placeholder="e.g. 🛍️" />
          </div>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 4 }}>URL *</label>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} style={inputStyle} required placeholder="https://" />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 4 }}>Description <span style={{ fontWeight: 400, color: C.textLight }}>(optional)</span></label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} placeholder="Short description shown under the button" />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Toggle checked={isEnabled} onChange={setIsEnabled} />
            <span style={{ fontSize: 13, color: C.textMid }}>{isEnabled ? "Enabled" : "Disabled"}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.textMid, fontSize: 13, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.gold, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {link?.id ? "Save Changes" : "Add Link"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ─── Phone Preview ───────────────────────────────────────────────────────────
function PhonePreview({ settings, links }: { settings: Settings; links: Link[] }) {
  const enabledLinks = links.filter((l) => l.isEnabled);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Phone frame */}
      <div
        style={{
          width: 375,
          height: 700,
          borderRadius: 40,
          border: `8px solid ${C.textDark}`,
          boxShadow: "0 24px 60px rgba(58,46,36,0.25), 0 4px 12px rgba(58,46,36,0.15)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: settings.backgroundColor,
          flexShrink: 0,
        }}
      >
        {/* URL bar */}
        <div
          style={{
            background: "#fff",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span style={{ fontSize: 11, color: C.textMid, fontFamily: "monospace" }}>artisansstories.com/links</span>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            backgroundColor: settings.backgroundColor,
            color: settings.textColor,
          }}
        >
          {/* Logo */}
          <Image src="/logo-color.png" alt="Logo" width={140} height={38} unoptimized style={{ marginBottom: 6 }} />
          <p style={{ fontSize: 11, color: settings.textColor, opacity: 0.6, marginBottom: 16, marginTop: 2 }}>Link Hub</p>

          {/* Profile image */}
          {settings.profileImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.profileImageUrl}
              alt="Profile"
              style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", marginBottom: 10 }}
            />
          )}

          {/* Bio */}
          {settings.profileBio && (
            <p style={{ fontSize: 11, textAlign: "center", opacity: 0.75, marginBottom: 16, lineHeight: 1.5 }}>{settings.profileBio}</p>
          )}

          {/* Links */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            {enabledLinks.length === 0 && (
              <p style={{ textAlign: "center", fontSize: 12, opacity: 0.5, padding: "16px 0" }}>No links yet</p>
            )}
            {enabledLinks.map((link) => (
              <div
                key={link.id}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: settings.buttonColor,
                  color: "#fff",
                  textAlign: "center",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
                  cursor: "default",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {link.icon && <span style={{ marginRight: 6 }}>{link.icon}</span>}
                  {link.title}
                </div>
                {link.description && (
                  <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>{link.description}</div>
                )}
              </div>
            ))}
          </div>

          <p style={{ marginTop: 24, fontSize: 10, opacity: 0.45 }}>© 2026 Artisans Stories</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function LinkTreeAdmin() {
  const [settings, setSettings] = useState<Settings>({
    isEnabled: false,
    profileName: "Artisans Stories",
    backgroundColor: "#FFFBF0",
    buttonColor: "#8B6914",
    textColor: "#1F2937",
  });
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [showNewLinkForm, setShowNewLinkForm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [settingsRes, linksRes] = await Promise.all([
        fetch("/api/admin/linktree/settings"),
        fetch("/api/admin/linktree/links"),
      ]);
      const settingsData = await settingsRes.json();
      const linksData = await linksRes.json();
      if (settingsData.settings) setSettings(settingsData.settings);
      setLinks(linksData.links || []);
    } catch (error) {
      console.error("Failed to load LinkTree data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await fetch("/api/admin/linktree/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch {
      setSaveMsg("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function saveLink(link: Partial<Link>) {
    try {
      const method = link.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/linktree/links", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(link),
      });
      const data = await res.json();
      if (link.id) {
        setLinks(links.map((l) => (l.id === link.id ? data.link : l)));
      } else {
        setLinks([...links, data.link]);
      }
      setEditingLink(null);
      setShowNewLinkForm(false);
    } catch {
      alert("Failed to save link");
    }
  }

  async function deleteLink(id: string) {
    if (!confirm("Delete this link?")) return;
    try {
      await fetch(`/api/admin/linktree/links?id=${id}`, { method: "DELETE" });
      setLinks(links.filter((l) => l.id !== id));
    } catch {
      alert("Failed to delete link");
    }
  }

  async function toggleLink(id: string, isEnabled: boolean) {
    try {
      await fetch("/api/admin/linktree/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isEnabled }),
      });
      setLinks(links.map((l) => (l.id === id ? { ...l, isEnabled } : l)));
    } catch {
      alert("Failed to toggle link");
    }
  }

  async function reorderLinks(newLinks: Link[]) {
    setLinks(newLinks);
    try {
      await fetch("/api/admin/linktree/links/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkIds: newLinks.map((l) => l.id) }),
      });
    } catch {
      alert("Failed to save order");
    }
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const items = Array.from(links);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    reorderLinks(items);
  }

  const publicUrl = settings.customSlug
    ? `https://artisansstories.com/${settings.customSlug}`
    : "https://artisansstories.com/links";

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <span style={{ color: C.textLight, fontSize: 16 }}>Loading…</span>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 14,
    color: C.textDark,
    background: C.card,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: C.textDark, margin: 0 }}>Link Hub</h1>
            <p style={{ color: C.textLight, marginTop: 4, fontSize: 14 }}>Manage your link-in-bio page</p>
          </div>
          {settings.isEnabled && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 8,
                background: C.gold,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              View Live Page →
            </a>
          )}
        </div>

        {/* Two-column layout */}
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>

          {/* ── Left column: editor ─────────────────────────────────────────── */}
          <div style={{ flex: "0 0 500px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Settings card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(58,46,36,0.06)" }}>
              {/* Collapsible header */}
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: C.textDark }}>Settings</span>
                <span style={{ color: C.textLight, fontSize: 18, lineHeight: 1, transform: settingsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  ▾
                </span>
              </button>

              {settingsOpen && (
                <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Enable toggle */}
                  <div style={{ paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.textDark }}>Enable public page</span>
                      <p style={{ fontSize: 12, color: C.textLight, margin: "2px 0 0" }}>Makes your Link Hub visible at the public URL</p>
                    </div>
                    <Toggle checked={settings.isEnabled} onChange={(v) => setSettings({ ...settings, isEnabled: v })} />
                  </div>

                  {/* Profile name */}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 4 }}>Profile Name</label>
                    <input
                      type="text"
                      value={settings.profileName}
                      onChange={(e) => setSettings({ ...settings, profileName: e.target.value })}
                      style={inputStyle}
                    />
                  </div>

                  {/* Bio */}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 4 }}>Bio <span style={{ fontWeight: 400, color: C.textLight }}>(optional)</span></label>
                    <textarea
                      value={settings.profileBio ?? ""}
                      onChange={(e) => setSettings({ ...settings, profileBio: e.target.value })}
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  {/* Profile image */}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 4 }}>Profile Image URL <span style={{ fontWeight: 400, color: C.textLight }}>(optional)</span></label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {settings.profileImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={settings.profileImageUrl} alt="Profile" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.border}`, flexShrink: 0 }} />
                      )}
                      <input
                        type="text"
                        value={settings.profileImageUrl ?? ""}
                        onChange={(e) => setSettings({ ...settings, profileImageUrl: e.target.value })}
                        placeholder="https://..."
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Colors */}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 8 }}>Colors</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <ColorInput label="Background" value={settings.backgroundColor} onChange={(v) => setSettings({ ...settings, backgroundColor: v })} />
                      <ColorInput label="Button" value={settings.buttonColor} onChange={(v) => setSettings({ ...settings, buttonColor: v })} />
                      <ColorInput label="Text" value={settings.textColor} onChange={(v) => setSettings({ ...settings, textColor: v })} />
                    </div>
                  </div>

                  {/* Save */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
                    <button
                      onClick={saveSettings}
                      disabled={saving}
                      style={{
                        padding: "9px 20px",
                        borderRadius: 8,
                        border: "none",
                        background: C.gold,
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: saving ? "not-allowed" : "pointer",
                        opacity: saving ? 0.7 : 1,
                      }}
                    >
                      {saving ? "Saving…" : "Save Settings"}
                    </button>
                    {saveMsg && <span style={{ fontSize: 13, color: saveMsg.startsWith("F") ? C.danger : C.success }}>{saveMsg}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Links card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px", boxShadow: "0 1px 4px rgba(58,46,36,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textDark, margin: 0 }}>Links <span style={{ fontWeight: 400, fontSize: 13, color: C.textLight }}>({links.length})</span></h2>
              </div>

              {/* New link form (inline, at top) */}
              {showNewLinkForm && (
                <LinkForm
                  onSave={saveLink}
                  onCancel={() => setShowNewLinkForm(false)}
                />
              )}

              {/* Drag-and-drop list */}
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="links">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {links.length === 0 && !showNewLinkForm && (
                        <div style={{ textAlign: "center", padding: "24px 0", color: C.textLight, fontSize: 14 }}>
                          No links yet — add your first one below
                        </div>
                      )}
                      {links.map((link, index) => (
                        <Draggable key={link.id} draggableId={link.id} index={index}>
                          {(provided, snapshot) => (
                            <div>
                              {editingLink?.id === link.id ? (
                                <div ref={provided.innerRef} {...provided.draggableProps}>
                                  <LinkForm
                                    link={link}
                                    onSave={saveLink}
                                    onCancel={() => setEditingLink(null)}
                                  />
                                </div>
                              ) : (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "10px 12px",
                                    background: snapshot.isDragging ? "#fffdf5" : C.card,
                                    border: `1px solid ${snapshot.isDragging ? C.gold : C.border}`,
                                    borderRadius: 10,
                                    boxShadow: snapshot.isDragging ? "0 8px 24px rgba(139,105,20,0.18)" : "0 1px 3px rgba(58,46,36,0.07)",
                                    ...provided.draggableProps.style,
                                  }}
                                >
                                  {/* Drag handle */}
                                  <span
                                    {...provided.dragHandleProps}
                                    style={{ color: C.textLight, cursor: "grab", fontSize: 16, lineHeight: 1, paddingRight: 2, flexShrink: 0 }}
                                    title="Drag to reorder"
                                  >
                                    ⠿
                                  </span>

                                  {/* Icon */}
                                  {link.icon && (
                                    <span style={{ fontSize: 16, flexShrink: 0 }}>{link.icon}</span>
                                  )}

                                  {/* Title + URL */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textDark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {link.title}
                                    </div>
                                    <div style={{ fontSize: 11, color: C.textLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {link.url}
                                    </div>
                                  </div>

                                  {/* Clicks badge */}
                                  <span style={{
                                    fontSize: 11,
                                    padding: "2px 8px",
                                    borderRadius: 99,
                                    background: "#f0ece6",
                                    color: C.textMid,
                                    fontWeight: 500,
                                    flexShrink: 0,
                                    whiteSpace: "nowrap",
                                  }}>
                                    {link.clicks} clicks
                                  </span>

                                  {/* Enable toggle */}
                                  <Toggle checked={link.isEnabled} onChange={(v) => toggleLink(link.id, v)} />

                                  {/* Edit */}
                                  <button
                                    onClick={() => { setEditingLink(link); setShowNewLinkForm(false); }}
                                    title="Edit"
                                    style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, color: C.textMid, fontSize: 15, lineHeight: 1 }}
                                  >
                                    ✏️
                                  </button>

                                  {/* Delete */}
                                  <button
                                    onClick={() => deleteLink(link.id)}
                                    title="Delete"
                                    style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, color: C.danger, fontSize: 15, lineHeight: 1 }}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

              {/* Add link button */}
              {!showNewLinkForm && (
                <button
                  onClick={() => { setShowNewLinkForm(true); setEditingLink(null); }}
                  style={{
                    marginTop: 14,
                    width: "100%",
                    padding: "11px",
                    borderRadius: 10,
                    border: `2px dashed ${C.gold}`,
                    background: C.goldLight,
                    color: C.gold,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    letterSpacing: "0.01em",
                  }}
                >
                  + Add Link
                </button>
              )}
            </div>
          </div>

          {/* ── Right column: phone preview ─────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, position: "sticky", top: 24 }}>
            <div style={{ marginBottom: 12, textAlign: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.08em" }}>Live Preview</span>
            </div>
            <PhonePreview settings={settings} links={links} />
          </div>
        </div>
      </div>
    </div>
  );
}
