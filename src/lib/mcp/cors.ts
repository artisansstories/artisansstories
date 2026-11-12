/**
 * mcp/cors.ts — CORS for the public MCP surface: /api/mcp, /oauth/register,
 * /oauth/token, /oauth/authorize and /.well-known/oauth-*.
 *
 * `*` is safe here because none of these endpoints use cookies; credentials
 * travel in the Authorization header (or a PKCE exchange), and browsers never
 * send credentialed requests to a wildcard origin. The consent form target
 * (/oauth/authorize/decision) uses the admin session cookie, so it deliberately
 * has NO CORS and checks same-origin itself.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version, Retry-After",
  "Access-Control-Max-Age": "86400",
};

/** 204 answer to a CORS preflight. */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Copy `res` with the CORS headers added (keeps status and body stream). */
export function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
