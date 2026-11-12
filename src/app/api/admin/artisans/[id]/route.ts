import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { getArtisan, updateArtisan, deleteArtisan } from "@/lib/admin-services/artisans";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireHouseAdminTenantId();
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    return toResponse(await getArtisan(db, id));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("[GET /api/admin/artisans/[id]]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireHouseAdminTenantId();
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = await request.json();
    return toResponse(await updateArtisan(db, id, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("[PUT /api/admin/artisans/[id]]", err);
    return NextResponse.json({ error: "Failed to update artisan" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireHouseAdminTenantId();
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    return toResponse(await deleteArtisan(db, id));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("[DELETE /api/admin/artisans/[id]]", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
