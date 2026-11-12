import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { listReturns } from "@/lib/admin-services/returns";
import { toResponse } from "@/lib/admin-services/http";
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const searchParams = request.nextUrl.searchParams;
    return toResponse(await listReturns(db, {
      status: searchParams.get("status") ?? "",
      page: parseInt(searchParams.get("page") ?? "1", 10),
      limit: parseInt(searchParams.get("limit") ?? "20", 10),
    }));
  } catch (err) {
    console.error("GET /api/admin/returns error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
