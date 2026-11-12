import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { deleteCategory, getCategory, updateCategory, type CategoryUpdateBody } from "@/lib/admin-services/categories";
import { toResponse } from "@/lib/admin-services/http";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    return toResponse(await getCategory(db, id));
  } catch (err) {
    console.error("GET /api/admin/categories/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    const body = await request.json() as CategoryUpdateBody;
    return toResponse(await updateCategory(db, id, body));
  } catch (err) {
    console.error("PUT /api/admin/categories/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    return toResponse(await deleteCategory(db, id));
  } catch (err) {
    console.error("DELETE /api/admin/categories/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
