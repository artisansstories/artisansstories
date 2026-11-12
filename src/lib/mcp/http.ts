/**
 * mcp/http.ts — the Streamable HTTP endpoint, shared by /api/mcp and
 * /api/mcp/<token>. Stateless: every POST verifies the credential, builds a
 * fresh McpServer + transport, handles the one JSON-RPC message, and is done.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { originFromRequest } from "@/lib/tenant-host";
import { mcpGloballyEnabled } from "./config";
import { verifyMcpCredential } from "./auth";
import { extractToken } from "./tokens";
import { buildMcpServer } from "./server";

function jsonRpcError(status: number, message: string, headers?: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: status === 401 ? -32001 : -32000, message }, id: null }),
    { status, headers: { "Content-Type": "application/json", ...(headers ?? {}) } },
  );
}

export function resourceMetadataUrl(req: Request): string {
  return `${originFromRequest(req)}/.well-known/oauth-protected-resource/api/mcp`;
}

export async function handleMcpPost(req: Request, pathToken?: string | null): Promise<Response> {
  const token = extractToken(req.headers, pathToken);
  const verdict = await verifyMcpCredential(token);
  if (!verdict.ok) {
    if (verdict.status === 404) return new Response("Not found", { status: 404 });
    const headers: Record<string, string> = {};
    if (verdict.status === 401) {
      headers["WWW-Authenticate"] = `Bearer resource_metadata="${resourceMetadataUrl(req)}"`;
    }
    return jsonRpcError(verdict.status, verdict.error, headers);
  }

  const server = buildMcpServer(verdict.ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
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
    { status: 405, headers: { "Content-Type": "application/json", Allow: "POST" } },
  );
}
