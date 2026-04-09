"use client";

import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

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
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [showNewLinkForm, setShowNewLinkForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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
      alert("Settings saved!");
    } catch (error) {
      alert("Failed to save settings");
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
    } catch (error) {
      alert("Failed to save link");
    }
  }

  async function deleteLink(id: string) {
    if (!confirm("Delete this link?")) return;
    try {
      await fetch(`/api/admin/linktree/links?id=${id}`, { method: "DELETE" });
      setLinks(links.filter((l) => l.id !== id));
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">LinkTree Manager</h1>
            <p className="text-gray-600 mt-1">Manage your link-in-bio page</p>
          </div>
          {settings.isEnabled && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              View Public Page →
            </a>
          )}
        </div>

        {/* Settings */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Settings</h2>
          
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.isEnabled}
                onChange={(e) => setSettings({ ...settings, isEnabled: e.target.checked })}
                className="w-5 h-5"
              />
              <span className="font-medium">Enable public LinkTree page</span>
            </label>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profile Name</label>
              <input
                type="text"
                value={settings.profileName}
                onChange={(e) => setSettings({ ...settings, profileName: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profile Bio</label>
              <textarea
                value={settings.profileBio || ""}
                onChange={(e) => setSettings({ ...settings, profileBio: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Background Color</label>
                <input
                  type="color"
                  value={settings.backgroundColor}
                  onChange={(e) => setSettings({ ...settings, backgroundColor: e.target.value })}
                  className="w-full h-10 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Button Color</label>
                <input
                  type="color"
                  value={settings.buttonColor}
                  onChange={(e) => setSettings({ ...settings, buttonColor: e.target.value })}
                  className="w-full h-10 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Text Color</label>
                <input
                  type="color"
                  value={settings.textColor}
                  onChange={(e) => setSettings({ ...settings, textColor: e.target.value })}
                  className="w-full h-10 border rounded"
                />
              </div>
            </div>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Links */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Links</h2>
            <button
              onClick={() => setShowNewLinkForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Add Link
            </button>
          </div>

          {showNewLinkForm && (
            <LinkForm
              onSave={saveLink}
              onCancel={() => setShowNewLinkForm(false)}
            />
          )}

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="links">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                  {links.map((link, index) => (
                    <Draggable key={link.id} draggableId={link.id} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="flex items-center gap-3 p-4 border rounded-lg bg-gray-50"
                        >
                          <div className="text-gray-400 cursor-move">⋮⋮</div>
                          <div className="flex-1">
                            <div className="font-medium">{link.title}</div>
                            <div className="text-sm text-gray-600 truncate">{link.url}</div>
                            <div className="text-xs text-gray-500">{link.clicks} clicks</div>
                          </div>
                          <button
                            onClick={() => toggleLink(link.id, !link.isEnabled)}
                            className={`px-3 py-1 rounded text-sm ${
                              link.isEnabled ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {link.isEnabled ? "Enabled" : "Disabled"}
                          </button>
                          <button
                            onClick={() => setEditingLink(link)}
                            className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteLink(link.id)}
                            className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {editingLink && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <LinkForm
                  link={editingLink}
                  onSave={saveLink}
                  onCancel={() => setEditingLink(null)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LinkForm({
  link,
  onSave,
  onCancel,
}: {
  link?: Link;
  onSave: (link: Partial<Link>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(link?.title || "");
  const [url, setUrl] = useState(link?.url || "");
  const [description, setDescription] = useState(link?.description || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ id: link?.id, title, url, description: description || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mb-4 p-4 border rounded-lg bg-white">
      <div>
        <label className="block text-sm font-medium mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">URL *</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
          Save
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
          Cancel
        </button>
      </div>
    </form>
  );
}
