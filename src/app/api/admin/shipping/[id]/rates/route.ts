import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RateCondition } from "@prisma/client";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id: zoneId } = await params;
    const body = await request.json();
    const { name, condition, minValue, maxValue, price, isActive } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "Rate name is required" }, { status: 400 });
    }
    // Verify zone exists
    const zone = await prisma.shippingZone.findUnique({ where: { id: zoneId } });
    if (!zone) return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    const rate = await prisma.shippingRate.create({
      data: {
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
