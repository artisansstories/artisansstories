import { mcpGloballyEnabled } from "@/lib/mcp/config";
import { CORS_HEADERS, jsonCors, notFound, protectedResourceMetadata } from "@/lib/mcp/oauth";

/**
 * RFC 9728 protected-resource metadata. Served at both
 * /.well-known/oauth-protected-resource and
 * /.well-known/oauth-protected-resource/api/mcp (path-suffixed form).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!mcpGloballyEnabled()) return notFound();
  return jsonCors(protectedResourceMetadata(request));
}

export async function OPTIONS() {
  if (!mcpGloballyEnabled()) return notFound();
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
