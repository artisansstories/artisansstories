import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { generateProductSKU, generateVariantSKU } from "@/lib/sku";

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    type: string;
    categoryName?: string | null;
    productSku?: string;
    optionValues?: string[];
  };
  const { type, categoryName, productSku, optionValues } = body;

  if (type === "product") {
    for (let i = 0; i < 10; i++) {
      const sku = generateProductSKU(categoryName);
      const existing = await prisma.product.findUnique({ where: { sku } });
      if (!existing) return NextResponse.json({ sku });
    }
    return NextResponse.json({ error: "Could not generate unique SKU" }, { status: 500 });
  }

  if (type === "variant") {
    if (!productSku) return NextResponse.json({ error: "productSku required" }, { status: 400 });
    for (let i = 0; i < 10; i++) {
      const sku = generateVariantSKU(productSku, optionValues ?? []);
      const existing = await prisma.productVariant.findUnique({ where: { sku } });
      if (!existing) return NextResponse.json({ sku });
    }
    return NextResponse.json({ error: "Could not generate unique SKU" }, { status: 500 });
  }

  return NextResponse.json({ error: "type must be product or variant" }, { status: 400 });
}
