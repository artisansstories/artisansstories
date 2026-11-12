import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { cancelOrder } from "@/lib/admin-services/orders";
import { toResponse } from "@/lib/admin-services/http";

interface CancelBody {
  reason: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = (await request.json()) as CancelBody;
    return toResponse(await cancelOrder(db, id, body.reason));
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/cancel error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
