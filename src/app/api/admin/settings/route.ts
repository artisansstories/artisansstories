import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { getSettings, updateSettings, updateEmailBranding } from "@/lib/admin-services/settings";
import { toResponse } from "@/lib/admin-services/http";

export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();
    return toResponse(await getSettings(db));
  } catch (error) {
    console.error("GET /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
export async function PUT(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const body = await request.json();
    return toResponse(await updateSettings(db, body));
  } catch (error) {
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
    console.error("PATCH /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
