import { NextRequest } from "next/server";
import { withApiKey, corsPreflight, jsonOk, SCOPE_STORE_READ } from "@/lib/api-v1";

/**
 * GET /api/v1/store/orders/[id]
 * Tenant-scoped order lookup by id. 404 if the order is not in this tenant.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiKey(req, SCOPE_STORE_READ, async ({ db }) => {
    const { id } = await params;

    const order = await db.order.findFirst({
      where: { id },
      include: {
        items: {
          select: {
            id: true,
            title: true,
            variantTitle: true,
            sku: true,
            quantity: true,
            price: true,
            total: true,
          },
        },
        fulfillments: { select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!order) {
      return jsonOk({ error: "Order not found" }, 404);
    }

    return jsonOk({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      financialStatus: order.financialStatus,
      // Order has no own fulfillmentStatus column; derive from latest fulfillment.
      fulfillmentStatus: order.fulfillments[0]?.status ?? "UNFULFILLED",
      total: order.total,
      currency: order.currency,
      items: order.items,
      createdAt: order.createdAt,
    });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
