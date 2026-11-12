import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { createZone, listZones, type ZoneCreateBody } from "@/lib/admin-services/shipping";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();

    return toResponse(await listZones(db));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/shipping error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const body = await request.json() as ZoneCreateBody;
    return toResponse(await createZone(db, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("POST /api/admin/shipping error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
