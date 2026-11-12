import { NextRequest, NextResponse } from "next/server";
import { originFromRequest } from "@/lib/tenant-host";
import { getMcpAdmin } from "@/lib/mcp/admin-access";
import { mintMcpKey, type Assistant } from "@/lib/mcp/keys";
import { setupMessage } from "@/lib/mcp/setup-messages";
import { authErrorResponse } from "@/lib/admin-api";

/**
 * POST /api/admin/mcp/keys — mint an MCP key for the admin's OWN store.
 * Body: { assistant: "muse" | "grokbot", access: "full" | "read" }
 * Only `mcp:admin` / `mcp:read` can be minted here. The raw key is returned once.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getMcpAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!admin.canManage) return NextResponse.json({ error: "Only store admins can create keys" }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { assistant?: unknown; access?: unknown };
    if (body.assistant !== "muse" && body.assistant !== "grokbot") {
      return NextResponse.json({ error: "`assistant` must be muse or grokbot" }, { status: 400 });
    }
    if (body.access !== "full" && body.access !== "read") {
      return NextResponse.json({ error: "`access` must be full or read" }, { status: 400 });
    }
    const assistant = body.assistant as Assistant;
    const key = await mintMcpKey(admin.tenantId, assistant, body.access === "read" ? "mcp:read" : "mcp:admin");
    const mcpUrl = `${originFromRequest(request)}/api/mcp`;
    return NextResponse.json(
      {
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scope: key.scope,
        createdAt: key.createdAt,
        token: key.token,
        mcpUrl,
        setupMessage: setupMessage(assistant, mcpUrl),
      },
      { status: 201 },
    );
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("POST /api/admin/mcp/keys error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
