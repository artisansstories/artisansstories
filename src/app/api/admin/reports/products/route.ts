import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Aggregate order items by product
    const orderItems = await prisma.orderItem.findMany({
      where: { productId: { not: null } },
      select: {
        productId: true,
        title: true,
        quantity: true,
        total: true,
        product: {
          select: {
            id: true,
            name: true,
            images: { select: { url: true }, orderBy: { position: "asc" }, take: 1 },
          },
        },
      },
    });

    // Aggregate by productId
    const byProduct: Record<
      string,
      { productId: string; productName: string; revenue: number; unitsSold: number; imageUrl?: string }
    > = {};

    for (const item of orderItems) {
      const pid = item.productId!;
      if (!byProduct[pid]) {
        byProduct[pid] = {
          productId: pid,
          productName: item.product?.name ?? item.title,
          revenue: 0,
          unitsSold: 0,
          imageUrl: item.product?.images?.[0]?.url,
        };
      }
      byProduct[pid].revenue += item.total;
      byProduct[pid].unitsSold += item.quantity;
    }

    const allProducts = Object.values(byProduct);

    const topByRevenue = [...allProducts]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const topByUnits = [...allProducts]
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);

    // Low stock: fetch all tracked inventory and filter in JS (Prisma can't compare two fields)
    const allInventory = await prisma.inventory.findMany({
      where: { trackedInventory: true },
      include: {
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    const lowStock = allInventory
      .filter((inv) => inv.quantity <= inv.lowStockThreshold)
      .map((inv) => ({
        variantId: inv.variantId,
        productName: inv.variant.product.name,
        variantName: inv.variant.name,
        quantity: inv.quantity,
        threshold: inv.lowStockThreshold,
        sku: inv.variant.sku ?? undefined,
      }));

    return NextResponse.json({ topByRevenue, topByUnits, lowStock });
  } catch (err) {
    console.error("GET /api/admin/reports/products error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
