import { handleMcpPost, mcpPreflight, methodNotAllowed } from "@/lib/mcp/http";

/**
 * /api/mcp — remote MCP server (Streamable HTTP, stateless, JSON responses).
 * Auth: `Authorization: Bearer <MCP key or OAuth access token>`. See docs/MCP.md.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleMcpPost(request);
}

/** Stateless server: no SSE stream (GET) and no session to end (DELETE). Both 405. */
export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}

export async function OPTIONS() {
  return mcpPreflight();
}
