"use client";

import { useState } from "react";

const GOLD = "#8B6914";

interface SocialLink {
  platform: "facebook" | "instagram" | "x" | "tiktok" | "pinterest" | "email";
  url?: string;
  value?: string; // For email
}

interface SocialLinksManagerProps {
  links: SocialLink[];
  onChange: (links: SocialLink[]) => void;
}

const PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X (Twitter)" },
  { id: "tiktok", label: "TikTok" },
  { id: "pinterest", label: "Pinterest" },
  { id: "email", label: "Email" },
] as const;

export default function SocialLinksManager({ links, onChange }: SocialLinksManagerProps) {
  const [adding, setAdding] = useState(false);
  const [newPlatform, setNewPlatform] = useState<string>("");
  const [newValue, setNewValue] = useState("");

  const handleAdd = () => {
    if (!newPlatform || !newValue) return;
    const newLink: SocialLink = {
      platform: newPlatform as any,
      ...(newPlatform === "email" ? { value: newValue } : { url: newValue }),
    };
    onChange([...links, newLink]);
    setAdding(false);
    setNewPlatform("");
    setNewValue("");
  };

  const handleRemove = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };

  const usedPlatforms = links.map((l) => l.platform);
  const availablePlatforms = PLATFORMS.filter((p) => !usedPlatforms.includes(p.id as any));

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        {links.length === 0 && (
          <div style={{ fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>No social links added yet.</div>
        )}
        {links.map((link, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "#faf9f6",
              border: "1px solid #e0d5c5",
              borderRadius: 8,
              marginBottom: 8,
            }}
          >
            <SocialIcon platform={link.platform} />
            <div style={{ flex: 1, fontSize: 13 }}>
              <strong style={{ textTransform: "capitalize" }}>{link.platform}:</strong>{" "}
              {link.platform === "email" ? link.value : link.url}
            </div>
            <button
              type="button"
              onClick={() => handleRemove(index)}
              style={{
                padding: "6px 12px",
                background: "#ef4444",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div style={{ background: "#faf9f6", border: "1px solid #e0d5c5", borderRadius: 8, padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Platform</label>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e0d5c5",
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              <option value="">Select platform...</option>
              {availablePlatforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              {newPlatform === "email" ? "Email Address" : "URL"}
            </label>
            <input
              type={newPlatform === "email" ? "email" : "url"}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={newPlatform === "email" ? "hello@example.com" : "https://..."}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e0d5c5",
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newPlatform || !newValue}
              style={{
                padding: "8px 16px",
                background: newPlatform && newValue ? GOLD : "#ccc",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: newPlatform && newValue ? "pointer" : "not-allowed",
              }}
            >
              Add Link
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewPlatform("");
                setNewValue("");
              }}
              style={{
                padding: "8px 16px",
                background: "#fff",
                color: "#3a2e24",
                border: "1px solid #e0d5c5",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={availablePlatforms.length === 0}
          style={{
            padding: "8px 16px",
            background: availablePlatforms.length > 0 ? GOLD : "#ccc",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: availablePlatforms.length > 0 ? "pointer" : "not-allowed",
          }}
        >
          + Add Social Link
        </button>
      )}
    </div>
  );
}

function SocialIcon({ platform }: { platform: string }) {
  const size = 20;
  const color = GOLD;

  switch (platform) {
    case "facebook":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case "instagram":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="17.5" cy="6.5" r="1" fill={color} stroke="none" />
        </svg>
      );
    case "x":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
        </svg>
      );
    case "pinterest":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
        </svg>
      );
    case "email":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
          <polyline points="3,7 12,13 21,7" />
        </svg>
      );
    default:
      return null;
  }
}
