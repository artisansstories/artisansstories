/**
 * mcp/redirect-allowlist.ts — OAuth redirect_uri validation (spec §3.2).
 *
 * Exact hostname match against MCP_OAUTH_REDIRECT_HOSTS, https only. A single
 * bad URI rejects the WHOLE registration — we never drop it and keep the rest.
 */
import { redirectHostAllowlist } from "./config";

export function isAllowedRedirectUri(uri: string, allowlist: Set<string> = redirectHostAllowlist()): boolean {
  if (typeof uri !== "string" || !uri) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.hash) return false;
  return allowlist.has(url.hostname.toLowerCase());
}

/** True only if `uris` is a non-empty array and EVERY entry is allowed. */
export function validateRedirectUris(uris: unknown, allowlist: Set<string> = redirectHostAllowlist()): uris is string[] {
  if (!Array.isArray(uris) || uris.length === 0) return false;
  return uris.every((u) => typeof u === "string" && isAllowedRedirectUri(u, allowlist));
}
