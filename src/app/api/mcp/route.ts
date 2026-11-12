import { handleMcpPost, methodNotAllowed } from "@/lib/mcp/http";

/**
 * /api/mcp — remote MCP server (Streamable HTTP, stateless).
 * Auth: `Authorization: Bearer <MCP key or OAuth access token>`. See docs/MCP.md.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleMcpPost(request);
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
