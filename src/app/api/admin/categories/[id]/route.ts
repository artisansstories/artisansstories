import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { deleteCategory, getCategory, updateCategory, type CategoryUpdateBody } from "@/lib/admin-services/categories";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    return toResponse(await getCategory(db, id));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
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
    // main checked existence BEFORE parsing the body: a missing category is a 404
    // even when the body is unparseable. Keep that order on the parse-error path.
    let body: CategoryUpdateBody;
    try {
      body = await request.json() as CategoryUpdateBody;
    } catch (parseErr) {
      const unauthorized = authErrorResponse(parseErr);
      if (unauthorized) return unauthorized;
      if (!(await db.category.findUnique({ where: { id }, select: { id: true } }))) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
      throw parseErr;
    }
    return toResponse(await updateCategory(db, id, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
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
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("DELETE /api/admin/categories/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
