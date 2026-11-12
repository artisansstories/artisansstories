import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { regenerateProductAltText } from "@/lib/admin-services/uploads";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";

/**
 * POST /api/admin/products/[id]/alt-text — ask the AI again for images that
 * only have fallback alt text. Body: { all?: boolean } to redo every image.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { all?: unknown };
    return toResponse(await regenerateProductAltText(db, id, body?.all === true));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("POST /api/admin/products/[id]/alt-text error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
