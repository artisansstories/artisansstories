import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { getTaxSettings, updateTaxSettings, type TaxUpdateBody } from "@/lib/admin-services/tax";
import { toResponse } from "@/lib/admin-services/http";
export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();

    return toResponse(await getTaxSettings(db));
  } catch (err) {
    console.error("GET /api/admin/tax error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function PUT(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const body = await request.json() as TaxUpdateBody;
    return toResponse(await updateTaxSettings(db, body));
  } catch (err) {
    console.error("PUT /api/admin/tax error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
