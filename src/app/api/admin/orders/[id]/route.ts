import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: true,
        fulfillments: { orderBy: { createdAt: "asc" } },
        returns: true,
      },
    });

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    return NextResponse.json({ order });
  } catch (err) {
    console.error("GET /api/admin/orders/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
