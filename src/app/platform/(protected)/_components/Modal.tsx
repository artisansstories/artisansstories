"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Reusable operator-console modal shell. Handles the a11y contract the platform
 * pages need everywhere: ESC to close, click-outside to close, a Tab focus trap,
 * `aria-modal`, focus-on-open, and focus restore on unmount. Mobile-friendly
 * (caps height + scrolls). Pass `closeDisabled` to lock it shut while a request
 * is in flight.
 */

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(45,59,85,0.10)",
  borderRadius: 12,
  padding: 20,
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  ariaLabel,
  onClose,
  closeDisabled = false,
  maxWidth = 460,
  children,
}: {
  ariaLabel: string;
  onClose: () => void;
  closeDisabled?: boolean;
  maxWidth?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const tryClose = useCallback(() => {
    if (!closeDisabled) onClose();
  }, [closeDisabled, onClose]);

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    const node = ref.current;
    // Focus the first focusable control (falls back to the dialog itself).
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        tryClose();
        return;
      }
      if (e.key === "Tab" && node) {
        const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null,
        );
        if (focusables.length === 0) {
          e.preventDefault();
          node.focus();
          return;
        }
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      prevActive?.focus?.();
    };
  }, [tryClose]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) tryClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,26,40,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        style={{
          ...card,
          width: "100%",
          maxWidth,
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          maxHeight: "90vh",
          overflowY: "auto",
          outline: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
