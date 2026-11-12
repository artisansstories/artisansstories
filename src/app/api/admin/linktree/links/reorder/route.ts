import { NextResponse } from "next/server";
import { resolveTenantFromAdminSession, DEFAULT_TENANT_ID } from "@/lib/tenant-context";
import { toResponse } from "@/lib/admin-services/http";
import { reorderLinkTreeLinks } from "@/lib/admin-services/linktree";

export async function POST(req: Request) {
  try {
    // Raw pg bypasses the scoped client — scope each UPDATE to the admin's tenant.
    const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
    const { linkIds } = await req.json();
    return toResponse(await reorderLinkTreeLinks(tenantId, linkIds));
  } catch (error) {
    console.error("Failed to reorder links:", error);
    return NextResponse.json({ error: "Failed to reorder links" }, { status: 500 });
  }
}
