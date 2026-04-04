import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DiscountType } from "@prisma/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const discount = await prisma.discount.findUnique({ where: { id } });
    if (!discount) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ discount });
  } catch (err) {
    console.error("GET /api/admin/discounts/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const body = await request.json() as {
      code?: string;
      type?: DiscountType;
      value?: number;
      minimumOrderAmount?: number | null;
      appliesToAll?: boolean;
      productIds?: string[];
      categoryIds?: string[];
      usageLimit?: number | null;
      perCustomerLimit?: number | null;
      startsAt?: string | null;
      endsAt?: string | null;
      isActive?: boolean;
    };

    const discount = await prisma.discount.update({
      where: { id },
      data: {
        ...(body.code !== undefined && { code: body.code.trim().toUpperCase() }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.value !== undefined && { value: body.value }),
        ...(body.minimumOrderAmount !== undefined && { minimumOrderAmount: body.minimumOrderAmount }),
        ...(body.appliesToAll !== undefined && { appliesToAll: body.appliesToAll }),
        ...(body.productIds !== undefined && { productIds: body.productIds }),
        ...(body.categoryIds !== undefined && { categoryIds: body.categoryIds }),
        ...(body.usageLimit !== undefined && { usageLimit: body.usageLimit }),
        ...(body.perCustomerLimit !== undefined && { perCustomerLimit: body.perCustomerLimit }),
        ...(body.startsAt !== undefined && { startsAt: body.startsAt ? new Date(body.startsAt) : null }),
        ...(body.endsAt !== undefined && { endsAt: body.endsAt ? new Date(body.endsAt) : null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json({ discount });
  } catch (err: unknown) {
    console.error("PUT /api/admin/discounts/[id] error:", err);
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Discount code already exists" }, { status: 409 });
    }
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json() as { isActive: boolean };

    const discount = await prisma.discount.update({
      where: { id },
      data: { isActive: body.isActive },
    });

    return NextResponse.json({ discount });
  } catch (err) {
    console.error("PATCH /api/admin/discounts/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    await prisma.discount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/discounts/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
