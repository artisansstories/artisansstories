/**
 * mcp/config.ts — MCP server configuration, read from env only.
 *
 * Everything here FAILS CLOSED:
 *   - MCP_TOKEN_SECRET unset/short → no tokens can be signed or verified.
 *   - MCP_ENABLED !== "true"       → the whole surface (/api/mcp, /oauth/*,
 *                                    /.well-known/oauth-*) answers 404.
 */

/** Issuer/audience claim baked into every MCP access token. Not a URL on purpose:
 *  the server is reachable on the apex AND on tenant subdomains. */
export const MCP_TOKEN_ISSUER = "artisansstories-mcp";

/** OAuth access-token lifetime. No refresh tokens yet (see docs/MCP.md). */
export const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Authorization-code lifetime. */
export const AUTH_CODE_TTL_SECONDS = 5 * 60;
/** Confirm-token lifetime for preview → confirm writes. */
export const CONFIRM_TOKEN_TTL_MS = 10 * 60 * 1000;

/** Default OAuth redirect hosts (exact hostnames, https only). */
export const DEFAULT_REDIRECT_HOSTS = [
  "claude.ai",
  "www.claude.ai",
  "claude.com",
  "www.claude.com",
  "chatgpt.com",
  "platform.openai.com",
];

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConfigError";
  }
}

/** HMAC/JWT secret. Throws when unset or too short — never falls back. */
export function mcpSecret(): Uint8Array {
  const raw = process.env.MCP_TOKEN_SECRET ?? "";
  if (raw.length < 32) {
    throw new McpConfigError("MCP_TOKEN_SECRET is not configured (min 32 chars)");
  }
  return new TextEncoder().encode(raw);
}

/** Raw secret string for node:crypto HMACs. Same fail-closed rule. */
export function mcpSecretString(): string {
  mcpSecret();
  return process.env.MCP_TOKEN_SECRET as string;
}

/** Platform-wide kill switch. Default OFF. */
export function mcpGloballyEnabled(): boolean {
  if (process.env.MCP_ENABLED !== "true") return false;
  try {
    mcpSecret();
    return true;
  } catch {
    return false;
  }
}

/** Exact-hostname redirect allowlist from MCP_OAUTH_REDIRECT_HOSTS. */
export function redirectHostAllowlist(): Set<string> {
  const raw = process.env.MCP_OAUTH_REDIRECT_HOSTS;
  const hosts = raw && raw.trim()
    ? raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_REDIRECT_HOSTS;
  return new Set(hosts);
}
