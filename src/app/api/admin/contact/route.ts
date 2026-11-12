import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { listContactMessages } from "@/lib/admin-services/contact";
import { toResponse } from "@/lib/admin-services/http";

export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);
    const status = searchParams.get("status");

    return toResponse(await listContactMessages(db, { page, limit, status }));
  } catch (error) {
    console.error("GET /api/admin/contact error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
