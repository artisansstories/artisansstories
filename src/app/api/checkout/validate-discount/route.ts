import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, subtotal } = body as { code: string; subtotal: number };

    if (!code || typeof subtotal !== "number") {
      return NextResponse.json({ valid: false, error: "Code and subtotal are required" }, { status: 400 });
    }

    const discount = await prisma.discount.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!discount) {
      return NextResponse.json({ valid: false, error: "Discount code not found" });
    }

    if (!discount.isActive) {
      return NextResponse.json({ valid: false, error: "This discount code is no longer active" });
    }

    const now = new Date();
    if (discount.endsAt && discount.endsAt <= now) {
      return NextResponse.json({ valid: false, error: "This discount code has expired" });
    }

    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return NextResponse.json({ valid: false, error: "This discount code has reached its usage limit" });
    }

    if (discount.minimumOrderAmount && subtotal < discount.minimumOrderAmount) {
      const minFormatted = (discount.minimumOrderAmount / 100).toFixed(2);
      return NextResponse.json({
        valid: false,
        error: `Minimum order amount of $${minFormatted} required`,
      });
    }

    let discountAmount = 0;
    if (discount.type === "PERCENTAGE") {
      discountAmount = Math.floor((subtotal * discount.value) / 100);
    } else if (discount.type === "FIXED_AMOUNT") {
      discountAmount = Math.min(discount.value, subtotal);
    } else if (discount.type === "FREE_SHIPPING") {
      // Amount will be determined at checkout based on shipping rate
      return NextResponse.json({
        valid: true,
        discountAmount: 0,
        type: "FREE_SHIPPING",
        code: discount.code,
      });
    }

    return NextResponse.json({
      valid: true,
      discountAmount,
      type: discount.type,
      code: discount.code,
    });
  } catch (error) {
    console.error("validate-discount error:", error);
    return NextResponse.json({ valid: false, error: "Failed to validate discount code" }, { status: 500 });
  }
}
