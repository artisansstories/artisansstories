import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const log = await db.emailLog.findUnique({ where: { id } });
    if (!log) {
      return NextResponse.json({ error: "Email log not found" }, { status: 404 });
    }
    return NextResponse.json({ log });
  } catch (error) {
    console.error("GET /api/admin/email-log/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
