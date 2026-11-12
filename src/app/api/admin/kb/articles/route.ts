import { NextRequest, NextResponse } from "next/server";
import { listKbArticles } from "@/lib/admin-services/kb";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Raw pg bypasses the scoped client — filter every query by tenant.
    const tenantId = await requireHouseAdminTenantId();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const category = searchParams.get("category")?.trim() ?? "";

    return toResponse(await listKbArticles(tenantId, { search, category }));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/kb/articles error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
