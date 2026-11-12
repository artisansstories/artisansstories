"use client";

import { useCallback, useEffect, useState } from "react";

type Assistant = "muse" | "grokbot";
type Access = "full" | "read";

interface McpKey {
  id: string;
  name: string;
  prefix: string;
  scope: "mcp:admin" | "mcp:read";
  lastUsedAt: string | null;
  createdAt: string;
}

interface McpState {
  globallyEnabled: boolean;
  migrated: boolean;
  enabled: boolean;
  canManage: boolean;
  mcpUrl: string;
  keys: McpKey[];
}

interface MintedKey {
  name: string;
  token: string;
  setupMessage: string;
  mcpUrl: string;
  scope: "mcp:admin" | "mcp:read";
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
  margin: "0 0 16px",
  paddingBottom: 12,
  borderBottom: "1px solid #f0ebe0",
};

const TEXT: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  color: "#5a4a38",
  lineHeight: 1.55,
  margin: 0,
};

const MUTED: React.CSSProperties = { ...TEXT, fontSize: 13, color: "#9a876e" };

const PRIMARY_BTN: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: "#8B6914",
  color: "#fff",
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BTN: React.CSSProperties = {
  ...PRIMARY_BTN,
  background: "#f5f0e8",
  color: "#5a4a38",
  border: "1px solid #e0d5c5",
};

const CODE_BOX: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
  background: "#fefcf9",
  border: "1px solid #e0d5c5",
  borderRadius: 8,
  padding: "12px 14px",
  color: "#3a2e24",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  margin: "8px 0",
};

const ASSISTANT_LABEL: Record<Assistant, string> = { muse: "Muse", grokbot: "Grokbot" };

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      style={SECONDARY_BTN}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this:", text);
        }
      }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export default function AiAssistantsPage() {
  const [state, setState] = useState<McpState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<Assistant | null>(null);
  const [access, setAccess] = useState<Access>("full");
  const [minted, setMinted] = useState<MintedKey | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mcp");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mcp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function mint() {
    if (!picking) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mcp/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistant: picking, access }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create key");
      setMinted({ name: data.name, token: data.token, setupMessage: data.setupMessage, mcpUrl: data.mcpUrl, scope: data.scope });
      setPicking(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: McpKey) {
    if (!window.confirm(`Disconnect "${key.name}"? It will stop working right away.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/mcp/keys/${encodeURIComponent(key.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not revoke");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke");
    } finally {
      setBusy(false);
    }
  }

  if (!state && !error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e8dcc8", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const canToggle = !!state && state.canManage && state.globallyEnabled && state.migrated;
  const canConnect = !!state && state.canManage && state.globallyEnabled && state.enabled;

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 28 }}>
        <a href="/admin/settings" style={{ ...MUTED, textDecoration: "none" }}>← Settings</a>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: "#3a2e24", margin: "6px 0 6px" }}>AI Assistants</h1>
        <p style={{ ...MUTED, fontSize: 14 }}>
          Let an AI assistant such as Muse or Grokbot look after your store for you: check orders, update products, answer messages.
          It always shows you what it&apos;s about to do and waits for your yes before refunding, emailing a customer, or changing anything.
        </p>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <p style={{ ...TEXT, color: "#dc2626" }}>{error}</p>
        </div>
      )}

      {state && !state.canManage && (
        <div style={{ ...SECTION_STYLE, background: "#fffbeb", borderColor: "#fde68a" }}>
          <p style={TEXT}>Only store admins can change AI assistant access. Ask an admin on your team.</p>
        </div>
      )}

      {/* 1. On / off */}
      {state && (
        <div style={SECTION_STYLE}>
          <h2 style={SECTION_TITLE}>Access</h2>
          {!state.globallyEnabled ? (
            <p style={TEXT}>AI assistant access isn&apos;t available on this platform yet. Your platform operator needs to switch it on.</p>
          ) : !state.migrated ? (
            <p style={TEXT}>This switch is waiting on a database update from your platform operator. Until then, AI assistants can&apos;t connect.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <p style={{ ...TEXT, fontWeight: 600 }}>{state.enabled ? "On: assistants you connect can reach your store" : "Off: no assistant can reach your store"}</p>
                <p style={MUTED}>Turning this off disconnects every assistant immediately. Your keys stay listed below.</p>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: canToggle ? "pointer" : "not-allowed" }}>
                <span style={{ ...TEXT, fontSize: 13 }}>{state.enabled ? "On" : "Off"}</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="AI assistant access"
                  checked={state.enabled}
                  disabled={!canToggle || busy}
                  onChange={(e) => toggle(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: "#8B6914" }}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* 2. Connect */}
      {state && (
        <div style={SECTION_STYLE}>
          <h2 style={SECTION_TITLE}>Connect an assistant</h2>
          {!state.enabled && <p style={{ ...MUTED, marginBottom: 12 }}>Turn access on first.</p>}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {(["muse", "grokbot"] as Assistant[]).map((a) => (
              <button
                key={a}
                type="button"
                style={{ ...PRIMARY_BTN, opacity: canConnect ? 1 : 0.5, cursor: canConnect ? "pointer" : "not-allowed" }}
                disabled={!canConnect || busy}
                onClick={() => {
                  setMinted(null);
                  setAccess("full");
                  setPicking(a);
                }}
              >
                Connect {ASSISTANT_LABEL[a]}
              </button>
            ))}
          </div>

          {picking && (
            <div style={{ marginTop: 20, padding: 16, border: "1px solid #ede8df", borderRadius: 10, background: "#fefcf9" }}>
              <p style={{ ...TEXT, fontWeight: 600, marginBottom: 10 }}>What should {ASSISTANT_LABEL[picking]} be allowed to do?</p>
              <label style={{ ...TEXT, display: "block", marginBottom: 8, cursor: "pointer" }}>
                <input type="radio" name="access" checked={access === "full"} onChange={() => setAccess("full")} />{" "}
                <strong>Full access</strong>: view everything and make changes. Refunds, customer emails, and other changes still need your yes every time.
              </label>
              <label style={{ ...TEXT, display: "block", marginBottom: 14, cursor: "pointer" }}>
                <input type="radio" name="access" checked={access === "read"} onChange={() => setAccess("read")} />{" "}
                <strong>Read-only</strong>: view orders, products, and reports. Can&apos;t change anything.
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={PRIMARY_BTN} disabled={busy} onClick={mint}>
                  {busy ? "Creating…" : "Create key"}
                </button>
                <button type="button" style={SECONDARY_BTN} onClick={() => setPicking(null)}>Cancel</button>
              </div>
            </div>
          )}

          {minted && (
            <div style={{ marginTop: 20, padding: 16, border: "2px solid #8B6914", borderRadius: 10, background: "#fffdf7" }}>
              <p style={{ ...TEXT, fontWeight: 600 }}>
                Key for {minted.name} created ({minted.scope === "mcp:read" ? "read-only" : "full access"}).
              </p>
              <p style={{ ...MUTED, marginTop: 4 }}>
                You&apos;ll only see this key once. If you lose it, revoke it below and connect again.
              </p>

              <p style={{ ...TEXT, fontWeight: 600, marginTop: 16 }}>Step 1: Paste this message into {minted.name.replace(" (read-only)", "")}</p>
              <div style={CODE_BOX}>{minted.setupMessage}</div>
              <CopyButton text={minted.setupMessage} label="Copy message" />

              <p style={{ ...TEXT, fontWeight: 600, marginTop: 16 }}>Step 2: When it asks for your key, paste this</p>
              <div style={CODE_BOX}>{minted.token}</div>
              <CopyButton text={minted.token} label="Copy key" />
              <p style={{ ...MUTED, marginTop: 8 }}>
                Paste the key only into the assistant&apos;s secure key or credentials box, not into the chat. Treat it like a password.
              </p>

              <details style={{ marginTop: 16 }}>
                <summary style={{ ...MUTED, cursor: "pointer" }}>Advanced: assistant only accepts a web address?</summary>
                <p style={{ ...MUTED, marginTop: 8 }}>
                  Some assistants can&apos;t send a key separately. They can use this address, which has the key built in. Keep it secret.
                </p>
                <div style={CODE_BOX}>{`${minted.mcpUrl}/${minted.token}`}</div>
              </details>

              <div style={{ marginTop: 16 }}>
                <button type="button" style={SECONDARY_BTN} onClick={() => setMinted(null)}>Done</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Active keys */}
      {state && (
        <div style={SECTION_STYLE}>
          <h2 style={SECTION_TITLE}>Connected assistants</h2>
          {state.keys.length === 0 ? (
            <p style={MUTED}>No assistants connected yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Inter', sans-serif", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#9a876e" }}>
                    <th style={{ padding: "8px 6px", fontWeight: 500 }}>Name</th>
                    <th style={{ padding: "8px 6px", fontWeight: 500 }}>Access</th>
                    <th style={{ padding: "8px 6px", fontWeight: 500 }}>Last used</th>
                    <th style={{ padding: "8px 6px", fontWeight: 500 }}>Created</th>
                    <th style={{ padding: "8px 6px" }} />
                  </tr>
                </thead>
                <tbody>
                  {state.keys.map((k) => (
                    <tr key={k.id} style={{ borderTop: "1px solid #f0ebe0", color: "#3a2e24" }}>
                      <td style={{ padding: "10px 6px" }}>
                        {k.name}
                        <div style={{ color: "#9a876e", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>{k.prefix}…</div>
                      </td>
                      <td style={{ padding: "10px 6px" }}>{k.scope === "mcp:read" ? "Read-only" : "Full access"}</td>
                      <td style={{ padding: "10px 6px" }}>{fmtDate(k.lastUsedAt)}</td>
                      <td style={{ padding: "10px 6px" }}>{fmtDate(k.createdAt)}</td>
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>
                        {state.canManage && (
                          <button
                            type="button"
                            style={{ ...SECONDARY_BTN, padding: "6px 12px", fontSize: 13, color: "#b91c1c" }}
                            disabled={busy}
                            onClick={() => revoke(k)}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
