import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { ReturnStatus } from "@prisma/client";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = await request.json() as { status: ReturnStatus };
    if (!body.status || !Object.values(ReturnStatus).includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const ret = await db.return.findUnique({ where: { id } });
    if (!ret) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    const updated = await db.return.update({
      where: { id },
      data: { status: body.status },
    });
    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("PATCH /api/admin/returns/[id]/status error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
