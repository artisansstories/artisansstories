import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { generateSku, type GenerateSkuBody } from "@/lib/admin-services/products";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";

export async function POST(req: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const body = (await req.json().catch(() => ({}))) as GenerateSkuBody;
    return toResponse(await generateSku(db, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("POST /api/admin/products/generate-sku error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
