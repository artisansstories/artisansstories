"use client";

import { useState } from "react";

/**
 * CodeBlock (O4) — a small client island giving the otherwise server-rendered
 * integration page a copy-to-clipboard affordance on its curl snippets. Keeping
 * this tiny and isolated lets the integration page stay primarily server-rendered.
 */
export default function CodeBlock({ code, label = "Copy" }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <button
        type="button"
        onClick={async () => {
          try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
        }}
        style={{
          position: "absolute", top: 8, right: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600,
          borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)",
          color: "#cfe9da", cursor: "pointer",
        }}
      >
        {copied ? "Copied ✓" : label}
      </button>
      <pre style={{
        background: "#11182b", color: "#9be7c4", borderRadius: 10, padding: "14px 16px", overflowX: "auto",
        fontSize: 12.5, lineHeight: 1.55, margin: 0, fontFamily: "'Anonymous Pro', ui-monospace, monospace",
      }}>{code}</pre>
    </div>
  );
}
