import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { RateCondition } from "@prisma/client";
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { rateId } = await params;
    const body = await request.json();
    const { name, condition, minValue, maxValue, price, isActive } = body;
    const rate = await db.shippingRate.update({
      where: { id: rateId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(condition !== undefined && { condition }),
        ...(minValue !== undefined && { minValue }),
        ...(maxValue !== undefined && { maxValue }),
        ...(price !== undefined && {
          price: condition === RateCondition.FREE ? 0 : price,
        }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return NextResponse.json({ rate });
  } catch (err) {
    console.error("PUT /api/admin/shipping/[id]/rates/[rateId] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { rateId } = await params;
    await db.shippingRate.delete({ where: { id: rateId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/shipping/[id]/rates/[rateId] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
