import { NextRequest, NextResponse } from "next/server";
import { originFromRequest } from "@/lib/tenant-host";
import { mcpGloballyEnabled } from "@/lib/mcp/config";
import { getMcpAdmin } from "@/lib/mcp/admin-access";
import { listMcpKeys } from "@/lib/mcp/keys";
import { getTenantMcpFlag, setTenantMcpFlag } from "@/lib/mcp/tenant-flag";
import { authErrorResponse } from "@/lib/admin-api";

/**
 * /api/admin/mcp — AI Assistants settings for the signed-in admin's store.
 *   GET   → switch state, MCP URL, active MCP keys
 *   PATCH → { enabled: boolean } turn store MCP access on/off (ADMIN+)
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getMcpAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [flag, keys] = await Promise.all([getTenantMcpFlag(admin.tenantId), listMcpKeys(admin.tenantId)]);
    return NextResponse.json({
      globallyEnabled: mcpGloballyEnabled(),
      migrated: flag.migrated,
      enabled: flag.enabled,
      canManage: admin.canManage,
      mcpUrl: `${originFromRequest(request)}/api/mcp`,
      keys,
    });
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/mcp error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await getMcpAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!admin.canManage) return NextResponse.json({ error: "Only store admins can change this" }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "`enabled` must be true or false" }, { status: 400 });
    }
    const res = await setTenantMcpFlag(admin.tenantId, body.enabled);
    if (!res.ok) {
      const error = res.reason === "not_migrated"
        ? "This switch needs a database update that hasn't been applied yet."
        : "Save your store settings once before turning this on.";
      return NextResponse.json({ error, reason: res.reason }, { status: 409 });
    }
    return NextResponse.json({ enabled: res.enabled });
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("PATCH /api/admin/mcp error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
