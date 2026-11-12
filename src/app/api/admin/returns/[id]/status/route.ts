import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { ReturnStatus } from "@prisma/client";
import { setReturnStatus } from "@/lib/admin-services/returns";
import { toResponse } from "@/lib/admin-services/http";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = await request.json() as { status: ReturnStatus };
    return toResponse(await setReturnStatus(db, id, body.status));
  } catch (err) {
    console.error("PATCH /api/admin/returns/[id]/status error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
