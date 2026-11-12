import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { rejectReturn } from "@/lib/admin-services/returns";
import { toResponse } from "@/lib/admin-services/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = await request.json() as { reason: string };
    return toResponse(await rejectReturn(db, id, body.reason));
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/reject error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
