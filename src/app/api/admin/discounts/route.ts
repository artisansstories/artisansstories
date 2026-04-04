import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DiscountType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const skip = (page - 1) * limit;

    const [discounts, total] = await Promise.all([
      prisma.discount.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.discount.count(),
    ]);

    return NextResponse.json({
      discounts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET /api/admin/discounts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as {
      code: string;
      type: DiscountType;
      value: number;
      minimumOrderAmount?: number;
      appliesToAll?: boolean;
      productIds?: string[];
      categoryIds?: string[];
      usageLimit?: number;
      perCustomerLimit?: number;
      startsAt?: string;
      endsAt?: string;
      isActive?: boolean;
    };

    if (!body.code || !body.type || body.value === undefined) {
      return NextResponse.json({ error: "code, type and value are required" }, { status: 400 });
    }

    const discount = await prisma.discount.create({
      data: {
        code: body.code.trim().toUpperCase(),
        type: body.type,
        value: body.value,
        minimumOrderAmount: body.minimumOrderAmount ?? null,
        appliesToAll: body.appliesToAll ?? true,
        productIds: body.productIds ?? [],
        categoryIds: body.categoryIds ?? [],
        usageLimit: body.usageLimit ?? null,
        perCustomerLimit: body.perCustomerLimit ?? null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({ discount }, { status: 201 });
  } catch (err: unknown) {
    console.error("POST /api/admin/discounts error:", err);
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Discount code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
