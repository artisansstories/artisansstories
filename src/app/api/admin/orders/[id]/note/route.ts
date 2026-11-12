import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { setOrderNote } from "@/lib/admin-services/orders";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
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
    return toResponse(await setOrderNote(db, id, body.adminNote));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("PATCH /api/admin/orders/[id]/note error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
