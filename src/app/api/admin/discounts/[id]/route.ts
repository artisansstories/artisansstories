import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import {
  deleteDiscount,
  getDiscount,
  setDiscountActive,
  updateDiscount,
  type DiscountUpdateBody,
} from "@/lib/admin-services/discounts";
import { toResponse } from "@/lib/admin-services/http";
interface RouteContext {
  params: Promise<{ id: string }>;
}
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    return toResponse(await getDiscount(db, id));
  } catch (err) {
    console.error("GET /api/admin/discounts/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    const body = await request.json() as DiscountUpdateBody;
    // P2002 → 409 and P2025 → 404 are handled inside updateDiscount.
    return toResponse(await updateDiscount(db, id, body));
  } catch (err: unknown) {
    console.error("PUT /api/admin/discounts/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    const body = await request.json() as { isActive: boolean };
    return toResponse(await setDiscountActive(db, id, body.isActive));
  } catch (err) {
    console.error("PATCH /api/admin/discounts/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const db = await getTenantPrismaForAdmin();

    const { id } = await params;
    return toResponse(await deleteDiscount(db, id));
  } catch (err) {
    console.error("DELETE /api/admin/discounts/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
