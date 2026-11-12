import { NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { productsReport } from "@/lib/admin-services/reports";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();
    return toResponse(await productsReport(db));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/reports/products error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
