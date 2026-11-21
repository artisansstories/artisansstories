"use client";

import { useState, useSyncExternalStore } from "react";
import type { LiveNotice } from "@/lib/store-notice-server";

const STORAGE_KEY = "storeNoticeDismissed";

// Every text/background pair clears WCAG AA (4.5:1) with room to spare.
export const NOTICE_PALETTE: Record<LiveNotice["style"], { bg: string; fg: string; border: string }> = {
  info: { bg: "#3a2e24", fg: "#faf7f2", border: "#3a2e24" },
  success: { bg: "#e7f1e4", fg: "#1e4a28", border: "#b9d6b2" },
  warning: { bg: "#fdf1d6", fg: "#5a3b00", border: "#e8cf8f" },
  urgent: { bg: "#9b1c1c", fg: "#ffffff", border: "#9b1c1c" },
};

const noSubscribe = () => () => {};
function readDismissed(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The banner itself. Plain text only (React escapes it). The inline script
 * hides an already-dismissed notice before first paint, so returning visitors
 * see no flash; the localStorage read covers client-side navigations.
 */
export default function StoreNoticeBar({ notice }: { notice: LiveNotice }) {
  const [closed, setClosed] = useState(false);
  const stored = useSyncExternalStore(noSubscribe, readDismissed, () => null);
  const c = NOTICE_PALETTE[notice.style] ?? NOTICE_PALETTE.info;
  const key = JSON.stringify(notice.dismissKey);

  if (closed || stored === notice.dismissKey) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, notice.dismissKey);
    } catch {}
    setClosed(true);
  }

  return (
    <div
      id="store-notice"
      role="region"
      aria-label="Store notice"
      style={{
        background: c.bg,
        color: c.fg,
        borderBottom: `1px solid ${c.border}`,
        fontFamily: "var(--font-inter), 'Inter', sans-serif",
        fontSize: 14,
        lineHeight: 1.45,
        width: "100%",
      }}
    >
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})===${key}){var s=document.createElement("style");s.textContent="#store-notice{display:none!important}";document.head.appendChild(s)}}catch(e){}`,
        }}
      />
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 4px 6px 16px",
          minHeight: 44,
        }}
      >
        <p style={{ flex: 1, minWidth: 0, margin: 0, overflowWrap: "anywhere", textAlign: "center" }}>
          {notice.message}
          {notice.linkUrl && notice.linkLabel && (
            <>
              {" "}
              <a href={notice.linkUrl} style={{ color: "inherit", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}>
                {notice.linkLabel}
              </a>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss notice"
          style={{
            flexShrink: 0,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            borderRadius: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
