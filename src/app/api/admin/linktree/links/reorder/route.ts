import { NextResponse } from "next/server";
import { toResponse } from "@/lib/admin-services/http";
import { reorderLinkTreeLinks } from "@/lib/admin-services/linktree";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

export async function POST(req: Request) {
  try {
    // Raw pg bypasses the scoped client — scope each UPDATE to the admin's tenant.
    const tenantId = await requireHouseAdminTenantId();
    const { linkIds } = await req.json();
    return toResponse(await reorderLinkTreeLinks(tenantId, linkIds));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("Failed to reorder links:", error);
    return NextResponse.json({ error: "Failed to reorder links" }, { status: 500 });
  }
}
