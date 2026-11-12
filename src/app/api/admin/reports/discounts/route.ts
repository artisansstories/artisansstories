import { NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { discountsReport } from "@/lib/admin-services/reports";
import { toResponse } from "@/lib/admin-services/http";
export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();
    return toResponse(await discountsReport(db));
  } catch (err) {
    console.error("GET /api/admin/reports/discounts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
