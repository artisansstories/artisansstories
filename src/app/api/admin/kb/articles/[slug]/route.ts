import { NextRequest, NextResponse } from "next/server";
import { getKbArticle, updateKbArticle } from "@/lib/admin-services/kb";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    // Raw pg bypasses the scoped client — scope by tenant (slug is per-tenant unique).
    const tenantId = await requireHouseAdminTenantId();
    const { slug } = await params;

    return toResponse(await getKbArticle(tenantId, slug));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("GET /api/admin/kb/articles/[slug] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    const tenantId = await requireHouseAdminTenantId();
    const { slug } = await params;

    const body = await req.json();

    return toResponse(await updateKbArticle(tenantId, slug, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("PUT /api/admin/kb/articles/[slug] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
