import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { createRate, type RateCreateBody } from "@/lib/admin-services/shipping";
import { toResponse } from "@/lib/admin-services/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id: zoneId } = await params;
    const body = await request.json() as RateCreateBody;
    return toResponse(await createRate(db, zoneId, body));
  } catch (err) {
    console.error("POST /api/admin/shipping/[id]/rates error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
