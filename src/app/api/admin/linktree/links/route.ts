import { NextResponse } from "next/server";
import { toResponse } from "@/lib/admin-services/http";
import {
  listLinkTreeLinks,
  createLinkTreeLink,
  updateLinkTreeLink,
  deleteLinkTreeLink,
} from "@/lib/admin-services/linktree";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

// These handlers use raw `pg` SQL, which bypasses the scoped Prisma client, so
// the tenant filter/stamp is applied by hand on every statement. Tenant is taken
// from the admin session; falls back to tenant zero to preserve the pre-existing
// (un-gated) behavior for the single-tenant store.

export async function GET() {
  try {
    const tenantId = await requireHouseAdminTenantId();
    return toResponse(await listLinkTreeLinks(tenantId));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("Failed to fetch links:", error);
    return NextResponse.json({ error: "Failed to fetch links" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const tenantId = await requireHouseAdminTenantId();
    const body = await req.json();
    return toResponse(await createLinkTreeLink(tenantId, body));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("Failed to create link:", error);
    return NextResponse.json({ error: "Failed to create link" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const tenantId = await requireHouseAdminTenantId();
    const body = await req.json();
    return toResponse(await updateLinkTreeLink(tenantId, body));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("Failed to update link:", error);
    return NextResponse.json({ error: "Failed to update link" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const tenantId = await requireHouseAdminTenantId();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    return toResponse(await deleteLinkTreeLink(tenantId, id));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("Failed to delete link:", error);
    return NextResponse.json({ error: "Failed to delete link" }, { status: 500 });
  }
}
