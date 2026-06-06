import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: { isDefault: "desc" } },
        orders: {
          orderBy: { createdAt: "desc" },
          include: {
            items: {
              include: {
                variant: {
                  include: {
                    product: { select: { name: true, images: { take: 1, select: { urlThumb: true, url: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Compute live stats from actual orders (ignoring stale denormalized counters)
    const cancelledStatuses = new Set(["CANCELLED", "REFUNDED"]);
    const voidedFinancial = new Set(["VOIDED", "REFUNDED", "PARTIALLY_REFUNDED"]);

    const activeOrders = customer.orders.filter(
      (o) => !cancelledStatuses.has(o.status) && !voidedFinancial.has(o.financialStatus)
    );
    const cancelledOrders = customer.orders.filter(
      (o) => cancelledStatuses.has(o.status) || voidedFinancial.has(o.financialStatus)
    );

    const netSpent = activeOrders.reduce((sum, o) => sum + o.total, 0);
    const grossSpent = customer.orders.reduce((sum, o) => sum + o.total, 0);
    const refundedAmount = cancelledOrders.reduce((sum, o) => sum + o.total, 0);

    const liveStats = {
      totalOrdersAll: customer.orders.length,
      totalOrdersActive: activeOrders.length,
      totalOrdersCancelled: cancelledOrders.length,
      netSpent,
      grossSpent,
      refundedAmount,
    };

    return NextResponse.json({ customer, liveStats });
  } catch (error) {
    console.error("GET /api/admin/customers/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as { notes?: string; tags?: string[] };

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.tags !== undefined && { tags: body.tags }),
      },
    });

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("PATCH /api/admin/customers/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
