import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { getAdminSession } from "@/lib/admin-auth";
import { teamActorFromSession } from "@/lib/admin-services/team";
import { authErrorResponse } from "@/lib/admin-api";
import { toResponse } from "@/lib/admin-services/http";
import { getNotice, setNotice, setNoticeVisibility, clearNotice, parseNoticePatch } from "@/lib/admin-services/store-notice";
import type { TenantPrisma } from "@/lib/tenant-prisma";

type Handler = (db: TenantPrisma, actor: { role: string }, request: NextRequest) => Promise<NextResponse>;

/** Live role (changing the notice needs ADMIN/SUPER_ADMIN), not the session token's. */
function withActor(method: string, handler: Handler) {
  return async (request: NextRequest) => {
    try {
      const db = await getTenantPrismaForAdmin();
      const session = await getAdminSession();
      const actor = session ? await teamActorFromSession(db, session.id) : null;
      if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return await handler(db, actor, request);
    } catch (error) {
      const unauthorized = authErrorResponse(error);
      if (unauthorized) return unauthorized;
      console.error(`${method} /api/admin/store-notice error:`, error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export const GET = withActor("GET", async (db) => toResponse(await getNotice(db)));

export const PUT = withActor("PUT", async (db, actor, request) => {
  const parsed = parseNoticePatch(await request.json().catch(() => null));
  if (!parsed.ok) return toResponse(parsed);
  return toResponse(await setNotice(db, actor, parsed.patch));
});

export const PATCH = withActor("PATCH", async (db, actor, request) => {
  const body = await request.json().catch(() => null);
  if (typeof body?.isVisible !== "boolean") return NextResponse.json({ error: "isVisible must be true or false" }, { status: 400 });
  return toResponse(await setNoticeVisibility(db, actor, body.isVisible));
});

export const DELETE = withActor("DELETE", async (db, actor) => toResponse(await clearNotice(db, actor)));
