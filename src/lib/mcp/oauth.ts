/**
 * mcp/oauth.ts — OAuth 2.1 (authorization code + PKCE S256) helpers.
 *
 * Client ids, codes and access tokens are signed JWTs (see tokens.ts). Codes
 * are also single-use: /oauth/token claims each one in McpNonce (kind
 * "oauth_code") before issuing a token. On top of that, a code is bound to the
 * client, the redirect_uri and the PKCE challenge, and expires in 5 minutes.
 */
import { originFromRequest } from "@/lib/tenant-host";
import { isAllowedRedirectUri } from "./redirect-allowlist";
import { verifyClientId, isMcpScope, type McpScope } from "./tokens";
import { CORS_HEADERS } from "./cors";

export { CORS_HEADERS };

export function oauthMetadata(req: Request) {
  const origin = originFromRequest(req);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp:admin", "mcp:read"],
  };
}

export function protectedResourceMetadata(req: Request) {
  const origin = originFromRequest(req);
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp:admin", "mcp:read"],
    resource_name: "Artisans Stories store admin",
  };
}


export function jsonCors(body: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS, ...(extra ?? {}) },
  });
}

export const notFound = () => new Response("Not found", { status: 404 });

/** Fixed delay before any credential-check failure (spec §3.3). */
export const failureDelay = () => new Promise((r) => setTimeout(r, 500));

export interface AuthorizeRequest {
  clientId: string;
  clientName?: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  /** Scope the client asked for; the user picks the final scope on consent. */
  requestedScope: McpScope;
}

export type AuthorizeValidation =
  | { ok: true; value: AuthorizeRequest }
  /** Not safe to redirect (bad client / redirect_uri): show the error page. */
  | { ok: false; redirectable: false; error: string }
  /** Safe to bounce back to the client with ?error=… */
  | { ok: false; redirectable: true; redirectUri: string; state?: string; error: string; description: string };

export async function validateAuthorizeParams(p: URLSearchParams): Promise<AuthorizeValidation> {
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const state = p.get("state") ?? undefined;
  const client = clientId ? await verifyClientId(clientId) : null;
  if (!client) return { ok: false, redirectable: false, error: "Unknown client. The app needs to register again." };
  // The redirect must be one the client registered AND still pass the allowlist
  // (the env allowlist may have been tightened since registration).
  if (!redirectUri || !client.redirect_uris.includes(redirectUri) || !isAllowedRedirectUri(redirectUri)) {
    return { ok: false, redirectable: false, error: "This redirect address is not allowed." };
  }
  const bounce = (error: string, description: string): AuthorizeValidation => ({
    ok: false, redirectable: true, redirectUri, state, error, description,
  });
  if (p.get("response_type") !== "code") return bounce("unsupported_response_type", "Only response_type=code is supported");
  const codeChallenge = p.get("code_challenge") ?? "";
  if (!codeChallenge || !/^[A-Za-z0-9\-_]{43,128}$/.test(codeChallenge)) {
    return bounce("invalid_request", "PKCE code_challenge is required");
  }
  if (p.get("code_challenge_method") !== "S256") return bounce("invalid_request", "code_challenge_method must be S256");
  const scopes = (p.get("scope") ?? "").split(/\s+/).filter(Boolean);
  const unknown = scopes.filter((s) => !isMcpScope(s));
  if (unknown.length) return bounce("invalid_scope", `Unknown scope: ${unknown.join(" ")}`);
  const requestedScope: McpScope = scopes.length && !scopes.includes("mcp:admin") ? "mcp:read" : "mcp:admin";
  return {
    ok: true,
    value: { clientId, clientName: client.client_name, redirectUri, state, codeChallenge, requestedScope },
  };
}

export function redirectWithParams(redirectUri: string, params: Record<string, string | undefined>): Response {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "no-store" } });
}
