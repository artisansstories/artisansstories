import { NextResponse } from "next/server";
import { toResponse } from "@/lib/admin-services/http";
import { getLinkTreeAnalytics } from "@/lib/admin-services/linktree";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

export async function GET() {
  try {
    // Raw pg bypasses the scoped client — every query is filtered by tenant.
    const tenantId = await requireHouseAdminTenantId();
    return toResponse(await getLinkTreeAnalytics(tenantId));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("[linktree analytics]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
