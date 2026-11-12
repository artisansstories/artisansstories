import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { createProduct, listProducts, type ProductCreateBody } from "@/lib/admin-services/products";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const searchParams = request.nextUrl.searchParams;
    return toResponse(await listProducts(db, {
      search: searchParams.get("search") ?? "",
      status: searchParams.get("status") ?? "",
      categoryId: searchParams.get("categoryId") ?? "",
      page: parseInt(searchParams.get("page") ?? "1", 10),
      limit: parseInt(searchParams.get("limit") ?? "20", 10),
    }));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/products error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const body = await request.json() as ProductCreateBody;
    return toResponse(await createProduct(db, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("POST /api/admin/products error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
