import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { getReturn, setReturnNote } from "@/lib/admin-services/returns";
import { toResponse } from "@/lib/admin-services/http";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    return toResponse(await getReturn(db, id));
  } catch (err) {
    console.error("GET /api/admin/returns/[id] error:", err);
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
    const body = await request.json() as { adminNote?: string };
    return toResponse(await setReturnNote(db, id, body.adminNote));
  } catch (err) {
    console.error("PUT /api/admin/returns/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
