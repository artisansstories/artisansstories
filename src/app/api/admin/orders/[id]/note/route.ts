import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
interface NoteBody {
  adminNote: string;
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = (await request.json()) as NoteBody;
    const order = await db.order.update({
      where: { id },
      data: { adminNote: body.adminNote },
    });
    return NextResponse.json({ order });
  } catch (err) {
    console.error("PATCH /api/admin/orders/[id]/note error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
