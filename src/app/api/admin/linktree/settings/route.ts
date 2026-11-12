import { NextResponse } from "next/server";
import { toResponse } from "@/lib/admin-services/http";
import { getLinkTreeSettings, saveLinkTreeSettings } from "@/lib/admin-services/linktree";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

// Raw `pg` SQL bypasses the scoped Prisma client; tenant filter/stamp applied by
// hand (src/lib/admin-services/linktree.ts). LinkTreeSettings is one-per-tenant
// (@@unique([tenantId])).

export async function GET() {
  try {
    const tenantId = await requireHouseAdminTenantId();
    return toResponse(await getLinkTreeSettings(tenantId));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("Failed to fetch LinkTree settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const tenantId = await requireHouseAdminTenantId();
    const body = await req.json();
    return toResponse(await saveLinkTreeSettings(tenantId, body));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("Failed to save LinkTree settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
