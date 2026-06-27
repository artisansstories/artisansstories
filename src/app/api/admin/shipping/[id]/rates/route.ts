import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { RateCondition } from "@prisma/client";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id: zoneId } = await params;
    const body = await request.json();
    const { name, condition, minValue, maxValue, price, isActive } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "Rate name is required" }, { status: 400 });
    }
    // Verify zone exists
    const zone = await db.shippingZone.findUnique({ where: { id: zoneId } });
    if (!zone) return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    const rate = await db.shippingRate.create({
      data: {
        tenantId: db.$tenantId,
        zoneId,
        name: name.trim(),
        condition: condition ?? RateCondition.FLAT,
        minValue: minValue ?? null,
        maxValue: maxValue ?? null,
        price: condition === RateCondition.FREE ? 0 : (price ?? 0),
        isActive: isActive ?? true,
      },
    });
    return NextResponse.json({ rate }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/shipping/[id]/rates error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
