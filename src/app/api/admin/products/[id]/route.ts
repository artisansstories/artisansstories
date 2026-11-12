import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { deleteProduct, getProduct, updateProduct, type ProductUpdateBody } from "@/lib/admin-services/products";
import { toResponse } from "@/lib/admin-services/http";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    return toResponse(await getProduct(db, id));
  } catch (err) {
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
    const body = await request.json() as ProductUpdateBody;
    return toResponse(await updateProduct(db, id, body));
  } catch (err) {
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
    console.error("DELETE /api/admin/products/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
