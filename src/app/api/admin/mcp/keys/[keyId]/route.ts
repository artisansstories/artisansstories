import { NextRequest, NextResponse } from "next/server";
import { getMcpAdmin } from "@/lib/mcp/admin-access";
import { revokeMcpKey } from "@/lib/mcp/keys";

/** DELETE /api/admin/mcp/keys/[keyId] — revoke one of this store's MCP keys. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  try {
    const admin = await getMcpAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!admin.canManage) return NextResponse.json({ error: "Only store admins can revoke keys" }, { status: 403 });
    const { keyId } = await params;
    const revoked = await revokeMcpKey(admin.tenantId, keyId);
    if (!revoked) return NextResponse.json({ error: "Key not found" }, { status: 404 });
    return NextResponse.json({ id: keyId, revoked: true });
  } catch (err) {
    console.error("DELETE /api/admin/mcp/keys/[keyId] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
