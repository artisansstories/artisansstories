import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const order = await db.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (!["SHIPPED", "FULFILLED"].includes(order.status)) {
      return NextResponse.json({ error: "Order must be shipped before marking delivered" }, { status: 400 });
    }

    const updated = await db.order.update({
      where: { id },
      data: { status: "DELIVERED" },
    });

    return NextResponse.json({ order: updated });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/deliver error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
