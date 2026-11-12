import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { deleteZone, getZone, updateZone, type ZoneUpdateBody } from "@/lib/admin-services/shipping";
import { toResponse } from "@/lib/admin-services/http";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    return toResponse(await getZone(db, id));
  } catch (err) {
    console.error("GET /api/admin/shipping/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    const body = await request.json() as ZoneUpdateBody;
    return toResponse(await updateZone(db, id, body));
  } catch (err) {
    console.error("PUT /api/admin/shipping/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    return toResponse(await deleteZone(db, id));
  } catch (err) {
    console.error("DELETE /api/admin/shipping/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
