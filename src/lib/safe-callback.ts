/**
 * Open-redirect guard for admin post-login callbackUrl.
 * Only allows internal /admin paths (no protocol-relative, no external host,
 * no path traversal back out of /admin). Falls back to "/admin".
 */
export function safeAdminCallback(raw: string | null | undefined): string {
  if (!raw) return "/admin";
  let value = raw.trim();
  // Reject anything that isn't a clean, single-leading-slash internal path.
  // Blocks: "//evil.com", "https://evil", "/\evil", backslashes, whitespace tricks.
  if (!value.startsWith("/")) return "/admin";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/admin";
  if (value.includes("\\")) return "/admin";
  // Must stay within the admin area.
  const pathOnly = value.split("?")[0].split("#")[0];
  if (pathOnly !== "/admin" && !pathOnly.startsWith("/admin/")) return "/admin";
  if (pathOnly.includes("..")) return "/admin";
  return value;
}

/**
 * Open-redirect guard for operator post-login callbackUrl.
 * Mirrors `safeAdminCallback` but constrains to internal /platform paths.
 * Falls back to "/platform".
 */
export function safePlatformCallback(raw: string | null | undefined): string {
  if (!raw) return "/platform";
  const value = raw.trim();
  if (!value.startsWith("/")) return "/platform";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/platform";
  if (value.includes("\\")) return "/platform";
  const pathOnly = value.split("?")[0].split("#")[0];
  if (pathOnly !== "/platform" && !pathOnly.startsWith("/platform/")) return "/platform";
  if (pathOnly.includes("..")) return "/platform";
  return value;
}
