import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

export async function POST(request: NextRequest) {
  try {
    await requireHouseAdminTenantId();
    const db = await getTenantPrismaForAdmin();
    const { artisanId } = await request.json() as { artisanId?: unknown };
    // Without this, `where: { id: undefined }` matches EVERY artisan and disconnects them all.
    if (typeof artisanId !== "string" || !artisanId) {
      return NextResponse.json({ error: "artisanId required" }, { status: 400 });
    }
    const { count } = await db.artisan.updateMany({
      where: { id: artisanId },
      data: { igAccessToken: null, igUserId: null, igTokenExpiry: null },
    });
    if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("POST /api/admin/instagram/disconnect error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
