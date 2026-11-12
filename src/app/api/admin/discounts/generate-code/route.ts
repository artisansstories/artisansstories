import { NextResponse } from "next/server";
import { generateDiscountCode } from "@/lib/admin-services/discounts";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse, requireAdminTenantId } from "@/lib/admin-api";
export async function GET() {
  try {
    await requireAdminTenantId();
    return toResponse(generateDiscountCode());
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/discounts/generate-code error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
