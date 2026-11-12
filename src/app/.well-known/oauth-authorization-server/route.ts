import { mcpGloballyEnabled } from "@/lib/mcp/config";
import { CORS_HEADERS, jsonCors, notFound, oauthMetadata } from "@/lib/mcp/oauth";

/** RFC 8414 authorization-server metadata for the MCP OAuth flow. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!mcpGloballyEnabled()) return notFound();
  return jsonCors(oauthMetadata(request));
}

export async function OPTIONS() {
  if (!mcpGloballyEnabled()) return notFound();
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
