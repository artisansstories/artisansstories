import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { salesReport } from "@/lib/admin-services/reports";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const searchParams = request.nextUrl.searchParams;
    return toResponse(
      await salesReport(db, {
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
      }),
    );
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/reports/sales error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
