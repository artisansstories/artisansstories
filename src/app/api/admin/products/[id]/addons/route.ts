import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { getProductAddons, setProductAddon } from "@/lib/admin-services/products";
import { toResponse } from "@/lib/admin-services/http";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;

    return toResponse(await getProductAddons(db, id));
  } catch (err) {
    console.error("GET /api/admin/products/[id]/addons error:", err);
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
    const body = await request.json();
    const { type, isEnabled } = body as { type: string; isEnabled: boolean };

    return toResponse(await setProductAddon(db, id, type, isEnabled));
  } catch (err) {
    console.error("PUT /api/admin/products/[id]/addons error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
