import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/shop/inventory?variantIds=id1,id2,id3
// Returns { [variantId]: availableQty } for each variant
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("variantIds") ?? "";
    const variantIds = raw.split(",").map(s => s.trim()).filter(Boolean);

    if (variantIds.length === 0) {
      return NextResponse.json({});
    }

    const inventories = await prisma.inventory.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, quantity: true, reservedQuantity: true, trackedInventory: true, allowBackorder: true },
    });

    const result: Record<string, number> = {};
    for (const inv of inventories) {
      if (!inv.trackedInventory) {
        result[inv.variantId] = 999; // unlimited
      } else {
        result[inv.variantId] = Math.max(0, (inv.quantity ?? 0) - (inv.reservedQuantity ?? 0));
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/shop/inventory]", err);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}
