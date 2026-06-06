import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (!["SHIPPED", "FULFILLED"].includes(order.status)) {
      return NextResponse.json({ error: "Order must be shipped before marking delivered" }, { status: 400 });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: "DELIVERED" },
    });

    return NextResponse.json({ order: updated });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/deliver error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
