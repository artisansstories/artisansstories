import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { deleteRate, updateRate, type RateUpdateBody } from "@/lib/admin-services/shipping";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id: zoneId, rateId } = await params;
    const body = await request.json() as RateUpdateBody;
    return toResponse(await updateRate(db, rateId, body, zoneId));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("PUT /api/admin/shipping/[id]/rates/[rateId] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id: zoneId, rateId } = await params;
    return toResponse(await deleteRate(db, rateId, zoneId));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("DELETE /api/admin/shipping/[id]/rates/[rateId] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
