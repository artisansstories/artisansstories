import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { listReturns, createReturn, type CreateReturnBody } from "@/lib/admin-services/returns";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const searchParams = request.nextUrl.searchParams;
    return toResponse(await listReturns(db, {
      status: searchParams.get("status") ?? "",
      page: parseInt(searchParams.get("page") ?? "1", 10),
      limit: parseInt(searchParams.get("limit") ?? "20", 10),
    }));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/returns error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST /api/admin/returns — create an APPROVED return for shipped items. */
export async function POST(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const body = (await request.json().catch(() => null)) as CreateReturnBody | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    return toResponse(await createReturn(db, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("POST /api/admin/returns error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
