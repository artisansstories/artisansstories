import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import {
  removeTeamMember,
  teamActorFromSession,
  teamManageDenied,
  updateTeamMember,
} from "@/lib/admin-services/team";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse } from "@/lib/admin-api";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Live role, not the (possibly stale) role in the session token.
    const actor = await teamActorFromSession(db, session.id);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Role check before reading the body, as before.
    const denied = teamManageDenied(actor);
    if (denied) return toResponse(denied);

    const { id } = await params;
    const body = await request.json() as { role?: string; isActive?: boolean };
    return toResponse(await updateTeamMember(db, actor, id, body));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("PUT /api/admin/team/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Forbidden — only SUPER_ADMIN can remove admins" }, { status: 403 });
    }
    const actor = await teamActorFromSession(db, session.id);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    return toResponse(await removeTeamMember(db, actor, id));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("DELETE /api/admin/team/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
