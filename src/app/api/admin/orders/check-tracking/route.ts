import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkTracking } from "@/lib/tracking";

/**
 * POST /api/admin/orders/check-tracking
 * Checks all SHIPPED orders against USPS/UPS APIs.
 * Flips status to DELIVERED when carrier confirms delivery.
 * Returns a summary of what was checked and what changed.
 */
export async function POST() {
  try {
    // Find all SHIPPED orders that have a tracking number
    const shippedOrders = await prisma.order.findMany({
      where: { status: "SHIPPED" },
      include: {
        fulfillments: {
          where: { trackingNumber: { not: null } },
          orderBy: { shippedAt: "desc" },
          take: 1,
        },
      },
    });

    if (shippedOrders.length === 0) {
      return NextResponse.json({ checked: 0, delivered: 0, results: [], message: "No shipped orders to check" });
    }

    const results: Array<{
      orderId: string;
      orderNumber: string;
      carrier: string;
      trackingNumber: string;
      status: string;
      description: string;
      changed: boolean;
    }> = [];

    let deliveredCount = 0;

    for (const order of shippedOrders) {
      const fulfillment = order.fulfillments[0];
      if (!fulfillment?.trackingNumber || !fulfillment.trackingCompany) continue;

      const result = await checkTracking(fulfillment.trackingCompany, fulfillment.trackingNumber);

      let changed = false;
      if (result.status === "delivered") {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "DELIVERED" },
        });
        changed = true;
        deliveredCount++;
      }

      results.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        carrier: fulfillment.trackingCompany,
        trackingNumber: fulfillment.trackingNumber,
        status: result.status,
        description: result.description,
        changed,
      });

      // Small delay to be polite to carrier APIs
      await new Promise(r => setTimeout(r, 200));
    }

    return NextResponse.json({
      checked: results.length,
      delivered: deliveredCount,
      results,
      message: deliveredCount > 0
        ? `${deliveredCount} order${deliveredCount !== 1 ? "s" : ""} marked as delivered`
        : "No new deliveries detected",
    });
  } catch (error) {
    console.error("check-tracking error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
