import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const ret = await prisma.return.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            email: true,
            total: true,
            stripePaymentIntentId: true,
            financialStatus: true,
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        items: {
          include: {
            orderItem: {
              select: {
                id: true,
                title: true,
                variantTitle: true,
                quantity: true,
                price: true,
                total: true,
                variantId: true,
                productSnapshot: true,
              },
            },
          },
        },
      },
    });
    if (!ret) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    return NextResponse.json({ return: ret });
  } catch (err) {
    console.error("GET /api/admin/returns/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const body = await request.json() as { adminNote?: string };
    const ret = await prisma.return.update({
      where: { id },
      data: { adminNote: body.adminNote },
    });
    return NextResponse.json({ return: ret });
  } catch (err) {
    console.error("PUT /api/admin/returns/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
