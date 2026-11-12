import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { listCommunications } from "@/lib/admin-services/communications";
import { toResponse } from "@/lib/admin-services/http";

/**
 * Unified communications feed.
 * Returns a merged, time-sorted list of:
 *   - ContactMessage entries (with replies inline) — type "conversation"
 *   - EmailLog entries — type "email"
 *
 * Query params:
 *   filter: ALL | CONVERSATIONS | TRANSACTIONAL | UNREAD
 *   page: number (default 1)
 *   limit: number (default 20)
 */
export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const sp = request.nextUrl.searchParams;
    const filter = sp.get("filter") ?? "ALL";
    const page = parseInt(sp.get("page") ?? "1", 10);
    const limit = parseInt(sp.get("limit") ?? "20", 10);

    return toResponse(await listCommunications(db, { filter, page, limit }));
  } catch (error) {
    console.error("GET /api/admin/communications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
