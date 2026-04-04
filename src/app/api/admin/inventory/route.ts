import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest) {
  try {
    
    
    const searchParams = request.nextUrl.searchParams;
    const lowStockParam = searchParams.get("lowStock");
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const inventory = await prisma.inventory.findMany({
      include: {
        variant: {
          include: {
            product: {
              include: {
                images: { where: { isDefault: true }, take: 1 },
              },
            },
          },
        },
      },
      orderBy: [{ quantity: "asc" }],
    });
    // Filter in JS (Prisma can't compare two fields natively)
    let filtered = inventory;
    if (lowStockParam === "true") {
      filtered = filtered.filter(
        (inv) => inv.quantity > 0 && inv.quantity <= inv.lowStockThreshold
      );
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.variant.product.name.toLowerCase().includes(q) ||
          (inv.variant.sku ?? "").toLowerCase().includes(q) ||
          (inv.variant.product.sku ?? "").toLowerCase().includes(q) ||
          inv.variant.name.toLowerCase().includes(q)
      );
    }
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);
    return NextResponse.json({
      inventory: paginated,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/admin/inventory error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
