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
    const zone = await prisma.shippingZone.findUnique({
      where: { id },
      include: { rates: { orderBy: { createdAt: "asc" } } },
    });

    if (!zone) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ zone });
  } catch (err) {
    console.error("GET /api/admin/shipping/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { name, countries, regions, isActive, position } = body;

    const zone = await prisma.shippingZone.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(countries !== undefined && { countries }),
        ...(regions !== undefined && { regions }),
        ...(isActive !== undefined && { isActive }),
        ...(position !== undefined && { position }),
      },
      include: {
        rates: { orderBy: { createdAt: "asc" } },
        _count: { select: { rates: true } },
      },
    });

    return NextResponse.json({ zone });
  } catch (err) {
    console.error("PUT /api/admin/shipping/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await prisma.shippingZone.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/shipping/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
