import { NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { customersReport } from "@/lib/admin-services/reports";
import { toResponse } from "@/lib/admin-services/http";
export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();
    return toResponse(await customersReport(db));
  } catch (err) {
    console.error("GET /api/admin/reports/customers error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
