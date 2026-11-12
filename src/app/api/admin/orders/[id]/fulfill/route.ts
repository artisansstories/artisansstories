import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { fulfillOrder, type FulfillBody } from "@/lib/admin-services/orders";
import { toResponse } from "@/lib/admin-services/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = (await request.json()) as FulfillBody;
    return toResponse(await fulfillOrder(db, id, body));
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/fulfill error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
