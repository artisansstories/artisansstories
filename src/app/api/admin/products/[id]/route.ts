import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { deleteProduct, getProduct, updateProduct, type ProductUpdateBody } from "@/lib/admin-services/products";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    return toResponse(await getProduct(db, id));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/products/[id] error:", err);
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
    // main checked existence BEFORE parsing the body: a missing product is a 404
    // even when the body is unparseable. Keep that order on the parse-error path.
    let body: ProductUpdateBody;
    try {
      body = await request.json() as ProductUpdateBody;
    } catch (parseErr) {
      const unauthorized = authErrorResponse(parseErr);
      if (unauthorized) return unauthorized;
      if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      throw parseErr;
    }
    return toResponse(await updateProduct(db, id, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("PUT /api/admin/products/[id] error:", err);
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
    return toResponse(await deleteProduct(db, id));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("DELETE /api/admin/products/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
