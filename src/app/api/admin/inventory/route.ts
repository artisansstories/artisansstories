import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { listInventory } from "@/lib/admin-services/inventory";
import { toResponse } from "@/lib/admin-services/http";
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const searchParams = request.nextUrl.searchParams;
    return toResponse(await listInventory(db, {
      lowStock: searchParams.get("lowStock") === "true",
      search: searchParams.get("search") ?? "",
      page: parseInt(searchParams.get("page") ?? "1", 10),
      limit: parseInt(searchParams.get("limit") ?? "50", 10),
    }));
  } catch (error) {
    console.error("GET /api/admin/inventory error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
