import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { getSettings, updateSettings, updateEmailBranding } from "@/lib/admin-services/settings";
import { toResponse } from "@/lib/admin-services/http";
import { getAdminSession } from "@/lib/admin-auth";
import { teamActorFromSession } from "@/lib/admin-services/team";
import { authErrorResponse } from "@/lib/admin-api";

export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();
    return toResponse(await getSettings(db));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
export async function PUT(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const session = await getAdminSession();
    // Live role (publishing needs ADMIN/SUPER_ADMIN), not the session token's.
    const actor = session ? await teamActorFromSession(db, session.id) : null;
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    return toResponse(await updateSettings(db, body, actor));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("PUT /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/settings — update the tenant's email branding (E1).
 * See updateEmailBranding in src/lib/admin-services/settings.ts.
 */
export async function PATCH(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const body = await request.json();
    return toResponse(await updateEmailBranding(db, body));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("PATCH /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
