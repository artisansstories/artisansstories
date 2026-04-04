import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RateCondition } from "@prisma/client";

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const zones = await prisma.shippingZone.findMany({
      orderBy: { position: "asc" },
      include: {
        rates: { orderBy: { createdAt: "asc" } },
        _count: { select: { rates: true } },
      },
    });

    return NextResponse.json({ zones });
  } catch (err) {
    console.error("GET /api/admin/shipping error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, countries, regions, isActive, rates } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Zone name is required" }, { status: 400 });
    }

    // Get highest position for ordering
    const last = await prisma.shippingZone.findFirst({ orderBy: { position: "desc" } });
    const position = (last?.position ?? -1) + 1;

    const zone = await prisma.shippingZone.create({
      data: {
        name: name.trim(),
        countries: countries ?? [],
        regions: regions ?? [],
        isActive: isActive ?? true,
        position,
        rates: rates?.length
          ? {
              create: rates.map((r: {
                name: string;
                condition?: RateCondition;
                minValue?: number;
                maxValue?: number;
                price: number;
                isActive?: boolean;
              }) => ({
                name: r.name,
                condition: r.condition ?? RateCondition.FLAT,
                minValue: r.minValue ?? null,
                maxValue: r.maxValue ?? null,
                price: r.price ?? 0,
                isActive: r.isActive ?? true,
              })),
            }
          : undefined,
      },
      include: {
        rates: true,
        _count: { select: { rates: true } },
      },
    });

    return NextResponse.json({ zone }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/shipping error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
