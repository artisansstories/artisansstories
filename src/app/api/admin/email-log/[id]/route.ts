import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { getEmailLog } from "@/lib/admin-services/communications";
import { toResponse } from "@/lib/admin-services/http";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    return toResponse(await getEmailLog(db, id));
  } catch (error) {
    console.error("GET /api/admin/email-log/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
