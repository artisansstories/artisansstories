import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    const zone = await db.shippingZone.findUnique({
      where: { id },
      include: { rates: { orderBy: { createdAt: "asc" } } },
    });
    if (!zone) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ zone });
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
    const body = await request.json();
    const { name, countries, regions, isActive, position } = body;
    const zone = await db.shippingZone.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(countries !== undefined && { countries }),
        ...(regions !== undefined && { regions }),
        ...(isActive !== undefined && { isActive }),
        ...(position !== undefined && { position }),
      },
      include: {
        rates: { orderBy: { createdAt: "asc" } },
        _count: { select: { rates: true } },
      },
    });
    return NextResponse.json({ zone });
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
    await db.shippingZone.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/shipping/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
