import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { createCategory, listCategories, type CategoryCreateBody } from "@/lib/admin-services/categories";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();

    return toResponse(await listCategories(db));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/categories error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const body = await request.json() as CategoryCreateBody;
    return toResponse(await createCategory(db, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("POST /api/admin/categories error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
