"use client";

import { useCallback, useEffect, useState } from "react";

interface IgStatus {
  id: string;
  connected: boolean;
  hasToken: boolean;
  igUserId: string | null;
  tokenExpired: boolean;
  daysUntilExpiry: number | null;
}

const IG_ERRORS: Record<string, string> = {
  invalid_state: "The Instagram sign-in expired or was started in another browser. Click Connect Instagram again.",
  token_failed: "Instagram didn't hand over access. Click Connect Instagram again; if it keeps failing, check the Instagram app settings.",
  access_denied: "The Instagram sign-in was cancelled.",
};

/**
 * Instagram connection for one artisan: status, Connect (the nonce-protected
 * OAuth route, as a full-page navigation so its cookie is set) and Disconnect.
 */
export default function InstagramConnection({ artisanId }: { artisanId: string }) {
  const [status, setStatus] = useState<IgStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/instagram/status");
      const data = (await res.json()) as { artisans?: IgStatus[] };
      setStatus(data.artisans?.find((a) => a.id === artisanId) ?? null);
    } catch {
      // status stays unknown; the buttons still work
    } finally {
      setLoaded(true);
    }
  }, [artisanId]);

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("ig_connected")) setMessage({ text: "Instagram connected.", error: false });
    const err = params.get("ig_error");
    if (err) setMessage({ text: IG_ERRORS[err] ?? `Instagram connection failed (${err}). Click Connect Instagram to try again.`, error: true });
  }, [load]);

  async function disconnect() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/instagram/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artisanId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(res.ok ? { text: "Instagram disconnected.", error: false } : { text: data.error ?? "Could not disconnect.", error: true });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const connectHref = `/api/admin/instagram/connect?artisanId=${encodeURIComponent(artisanId)}`;
  let line = "Checking…";
  if (loaded) {
    if (status?.connected) {
      line = `Connected${status.igUserId ? ` (Instagram user ${status.igUserId})` : ""}${status.daysUntilExpiry !== null ? `. Access expires in ${status.daysUntilExpiry} day${status.daysUntilExpiry === 1 ? "" : "s"}; reconnect before then.` : "."}`;
    } else if (status?.tokenExpired) {
      line = "The Instagram access expired. Reconnect to keep showing posts.";
    } else {
      line = "Not connected.";
    }
  }

  return (
    <div id="instagram" data-testid="instagram-connection">
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6b5540", margin: "0 0 12px" }}>{line}</p>
      {message && (
        <p role={message.error ? "alert" : "status"} style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: message.error ? "#b91c1c" : "#15803d", margin: "0 0 12px" }}>
          {message.text}
        </p>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <a
          href={connectHref}
          style={{ padding: "8px 16px", borderRadius: 8, background: "linear-gradient(135deg, #8B6914 0%, #C9A84C 100%)", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif", textDecoration: "none" }}
        >
          {status?.connected ? "Reconnect Instagram" : "Connect Instagram"}
        </a>
        {status?.hasToken && (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e0d5c5", background: "#fff", color: "#b91c1c", fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif", cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
      </div>
    </div>
  );
}
