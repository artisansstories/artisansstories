import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { refundReturn, type ReturnRefundBody } from "@/lib/admin-services/returns";
import { toResponse } from "@/lib/admin-services/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = await request.json() as ReturnRefundBody;
    return toResponse(await refundReturn(db, id, body));
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/refund error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
