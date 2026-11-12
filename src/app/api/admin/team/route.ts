import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { addTeamMember, listTeam, teamManageDenied } from "@/lib/admin-services/team";
import { toResponse } from "@/lib/admin-services/http";

export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();
    return toResponse(await listTeam(db));
  } catch (err) {
    console.error("GET /api/admin/team error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const actor = { id: session.id, role: session.role, name: session.name };
    // Role check before reading the body, as before.
    const denied = teamManageDenied(actor);
    if (denied) return toResponse(denied);

    const body = await request.json() as { name: string; email: string; role: string };
    return toResponse(await addTeamMember(db, actor, body));
  } catch (err) {
    console.error("POST /api/admin/team error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
