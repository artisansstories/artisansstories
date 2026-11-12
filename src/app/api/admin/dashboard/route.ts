import { NextResponse } from "next/server";
import { resolveTenantFromAdminSession } from "@/lib/tenant-context";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { getDashboard } from "@/lib/admin-services/dashboard";
import { toResponse } from "@/lib/admin-services/http";

export async function GET() {
  try {
    const tenantId = await resolveTenantFromAdminSession();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const db = getTenantPrisma(tenantId);
    return toResponse(await getDashboard(db));
  } catch (error) {
    console.error("GET /api/admin/dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
