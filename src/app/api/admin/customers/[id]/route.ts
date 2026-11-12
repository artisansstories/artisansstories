import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { getCustomer, updateCustomer, type CustomerUpdateBody } from "@/lib/admin-services/customers";
import { toResponse } from "@/lib/admin-services/http";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    return toResponse(await getCustomer(db, id));
  } catch (error) {
    console.error("GET /api/admin/customers/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const body = await request.json() as CustomerUpdateBody;
    return toResponse(await updateCustomer(db, id, body));
  } catch (error) {
    console.error("PATCH /api/admin/customers/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
