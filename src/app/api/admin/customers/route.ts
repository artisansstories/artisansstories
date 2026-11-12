import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { listCustomers } from "@/lib/admin-services/customers";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const searchParams = request.nextUrl.searchParams;
    return toResponse(
      await listCustomers(db, {
        search: searchParams.get("search") ?? "",
        page: parseInt(searchParams.get("page") ?? "1", 10),
        limit: parseInt(searchParams.get("limit") ?? "20", 10),
      })
    );
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/customers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
