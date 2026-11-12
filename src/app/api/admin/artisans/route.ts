import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { listArtisans, createArtisan } from "@/lib/admin-services/artisans";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

export async function GET() {
  try {
    await requireHouseAdminTenantId();
    const db = await getTenantPrismaForAdmin();
    return toResponse(await listArtisans(db));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("[GET /api/admin/artisans]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireHouseAdminTenantId();
    const db = await getTenantPrismaForAdmin();
    const body = await request.json();
    return toResponse(await createArtisan(db, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("[POST /api/admin/artisans]", err);
    return NextResponse.json({ error: "Failed to create artisan" }, { status: 500 });
  }
}
