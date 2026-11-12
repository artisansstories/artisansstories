import { handleMcpPost, methodNotAllowed } from "@/lib/mcp/http";

/**
 * /api/mcp/<token> — same server, credential in the URL path for clients that
 * can only take a URL. Prefer the Authorization header (Muse's credential
 * substitution only covers headers). A header, when present, wins.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handleMcpPost(request, token);
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
