import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";

const DEFAULT_MONOGRAM_CONFIG = {
  fonts: ["Anonymous Pro", "Happy Monkey", "Oregano"],
  maxChars: 50,
  styles: ["INITIALS", "FULL_NAME"],
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;

    const addons = await db.productAddon.findMany({
      where: { productId: id },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ addons });
  } catch (err) {
    console.error("GET /api/admin/products/[id]/addons error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = await request.json();
    const { type, isEnabled } = body as { type: string; isEnabled: boolean };

    if (!type || typeof isEnabled !== "boolean") {
      return NextResponse.json({ error: "type and isEnabled are required" }, { status: 400 });
    }

    if (type !== "LASER_MONOGRAM") {
      return NextResponse.json({ error: "Invalid addon type" }, { status: 400 });
    }

    // Verify product exists
    const product = await db.product.findUnique({ where: { id } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Upsert the addon
    const addon = await db.productAddon.upsert({
      where: { productId_type: { productId: id, type: "LASER_MONOGRAM" } },
      create: {
        tenantId: db.$tenantId,
        productId: id,
        type: "LASER_MONOGRAM",
        isEnabled,
        config: DEFAULT_MONOGRAM_CONFIG,
      },
      update: { isEnabled },
    });

    return NextResponse.json({ addon });
  } catch (err) {
    console.error("PUT /api/admin/products/[id]/addons error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
