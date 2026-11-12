import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { requireAdminSession } from "@/lib/admin-auth";
import { getArtisan, updateArtisan, deleteArtisan } from "@/lib/admin-services/artisans";
import { toResponse } from "@/lib/admin-services/http";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getTenantPrismaForAdmin();
    await requireAdminSession();
    const { id } = await params;
    return toResponse(await getArtisan(db, id));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getTenantPrismaForAdmin();
    await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    return toResponse(await updateArtisan(db, id, body));
  } catch (err) {
    console.error("[PUT /api/admin/artisans/[id]]", err);
    return NextResponse.json({ error: "Failed to update artisan" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getTenantPrismaForAdmin();
    await requireAdminSession();
    const { id } = await params;
    return toResponse(await deleteArtisan(db, id));
  } catch (err) {
    console.error("[DELETE /api/admin/artisans/[id]]", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
