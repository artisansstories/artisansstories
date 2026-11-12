import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { markOrderDelivered } from "@/lib/admin-services/orders";
import { toResponse } from "@/lib/admin-services/http";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    return toResponse(await markOrderDelivered(db, id));
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/deliver error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
