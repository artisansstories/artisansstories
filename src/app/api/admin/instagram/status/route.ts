import { NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { instagramStatus } from "@/lib/admin-services/instagram";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

/** GET /api/admin/instagram/status — per-artisan connection status (no tokens). */
export async function GET() {
  try {
    await requireHouseAdminTenantId();
    const db = await getTenantPrismaForAdmin();
    return toResponse(await instagramStatus(db));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/instagram/status error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
