import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const body = await request.json();
    // Fetch current inventory
    const current = await prisma.inventory.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let newQty: number;
    if (typeof body.quantity === "number") {
      newQty = Math.max(0, body.quantity);
    } else if (typeof body.delta === "number") {
      newQty = Math.max(0, current.quantity + body.delta);
    } else {
      return NextResponse.json({ error: "Provide quantity or delta" }, { status: 400 });
    }
    const oldQty = current.quantity;
    const delta = newQty - oldQty;
    const [updated] = await prisma.$transaction([
      prisma.inventory.update({
        where: { id },
        data: { quantity: newQty },
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
      }),
      prisma.inventoryLog.create({
        data: {
          inventoryId: id,
          delta,
          reason: "Manual adjustment",
          note: `Adjusted from ${oldQty} to ${newQty}`,
        },
      }),
    ]);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/admin/inventory/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
