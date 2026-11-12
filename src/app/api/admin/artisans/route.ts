import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { requireAdminSession } from "@/lib/admin-auth";
import { listArtisans, createArtisan } from "@/lib/admin-services/artisans";
import { toResponse } from "@/lib/admin-services/http";

export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();
    await requireAdminSession();
    return toResponse(await listArtisans(db));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    await requireAdminSession();
    const body = await request.json();
    return toResponse(await createArtisan(db, body));
  } catch (err) {
    console.error("[POST /api/admin/artisans]", err);
    return NextResponse.json({ error: "Failed to create artisan" }, { status: 500 });
  }
}
