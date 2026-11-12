import { NextResponse } from "next/server";
import { generateDiscountCode } from "@/lib/admin-services/discounts";
import { toResponse } from "@/lib/admin-services/http";
export async function GET() {
  try {
    return toResponse(generateDiscountCode());
  } catch (err) {
    console.error("GET /api/admin/discounts/generate-code error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
