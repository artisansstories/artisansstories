"use client";

import { useEffect } from "react";

/**
 * Client-side redirect to the admin login, preserving the intended destination
 * as a callbackUrl. Reads the live browser path (always available client-side),
 * avoiding the need for middleware/header plumbing.
 */
export function RedirectToLogin() {
  useEffect(() => {
    const dest = window.location.pathname + window.location.search;
    const isAdminPath = dest === "/admin" || dest.startsWith("/admin/");
    const qs =
      isAdminPath && dest !== "/admin"
        ? `?callbackUrl=${encodeURIComponent(dest)}`
        : "";
    window.location.replace(`/admin/login${qs}`);
  }, []);

  return null;
}
