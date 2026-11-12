import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { createDiscount, listDiscounts, type DiscountCreateBody } from "@/lib/admin-services/discounts";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const searchParams = request.nextUrl.searchParams;
    return toResponse(
      await listDiscounts(db, {
        page: parseInt(searchParams.get("page") ?? "1", 10),
        limit: parseInt(searchParams.get("limit") ?? "20", 10),
      })
    );
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/discounts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const body = await request.json() as DiscountCreateBody;
    // P2002 (duplicate code) → 409 is handled inside createDiscount.
    return toResponse(await createDiscount(db, body));
  } catch (err: unknown) {
    console.error("POST /api/admin/discounts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
