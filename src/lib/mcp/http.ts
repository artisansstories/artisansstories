/**
 * mcp/http.ts — the Streamable HTTP endpoint, shared by /api/mcp and
 * /api/mcp/<token>. Stateless: every POST verifies the credential, builds a
 * fresh McpServer + transport, handles the one JSON-RPC message, and is done.
 * Responses are plain JSON (`enableJsonResponse`), never a long-lived SSE
 * stream, so they fit Vercel's request/response model.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { originFromRequest } from "@/lib/tenant-host";
import { mcpGloballyEnabled } from "./config";
import { verifyMcpCredential } from "./auth";
import { extractToken } from "./tokens";
import { buildMcpServer } from "./server";
import { CORS_HEADERS, withCors } from "./cors";
import { MCP_PER_CREDENTIAL, MCP_PER_IP, clientIp, credentialKey, hit } from "./rate-limit";

function jsonRpcError(status: number, message: string, headers?: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: status === 401 ? -32001 : -32000, message }, id: null }),
    { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(headers ?? {}) } },
  );
}

/** RFC 9728 metadata URL advertised in 401s. Served for the host the client called. */
export function resourceMetadataUrl(req: Request): string {
  return `${originFromRequest(req)}/.well-known/oauth-protected-resource`;
}

export function wwwAuthenticate(req: Request): string {
  return `Bearer resource_metadata="${resourceMetadataUrl(req)}"`;
}

function tooMany(retryAfterSec: number): Response {
  return jsonRpcError(429, "Too many requests. Slow down and retry after the Retry-After interval.", {
    "Retry-After": String(retryAfterSec),
  });
}

/**
 * The SDK answers 406 unless Accept lists BOTH application/json and
 * text/event-stream. We always reply with JSON, so accept clients that only
 * send `application/json`, `*\/*`, or no Accept at all.
 */
function withLenientAccept(req: Request): Request {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json") && accept.includes("text/event-stream")) return req;
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  return new Request(req, { headers });
}

export async function handleMcpPost(req: Request, pathToken?: string | null): Promise<Response> {
  if (!mcpGloballyEnabled()) return new Response("Not found", { status: 404 });

  // Best-effort, per-instance limits (see rate-limit.ts), checked before any DB work.
  const ipVerdict = hit(`mcp:ip:${clientIp(req)}`, MCP_PER_IP);
  if (!ipVerdict.ok) return tooMany(ipVerdict.retryAfterSec);
  const token = extractToken(req.headers, pathToken);
  if (token) {
    const keyVerdict = hit(`mcp:cred:${credentialKey(token)}`, MCP_PER_CREDENTIAL);
    if (!keyVerdict.ok) return tooMany(keyVerdict.retryAfterSec);
  }

  const verdict = await verifyMcpCredential(token);
  if (!verdict.ok) {
    if (verdict.status === 404) return new Response("Not found", { status: 404 });
    const headers: Record<string, string> = {};
    if (verdict.status === 401) headers["WWW-Authenticate"] = wwwAuthenticate(req);
    return jsonRpcError(verdict.status, verdict.error, headers);
  }

  const server = buildMcpServer(verdict.ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(withLenientAccept(req)));
  } finally {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}

/** GET (SSE stream) and DELETE (session end) don't apply to a stateless server. */
export function methodNotAllowed(): Response {
  if (!mcpGloballyEnabled()) return new Response("Not found", { status: 404 });
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: POST only)" }, id: null }),
    { status: 405, headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", ...CORS_HEADERS } },
  );
}

export function mcpPreflight(): Response {
  if (!mcpGloballyEnabled()) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
