import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { resolveTenantFromAdminSession, DEFAULT_TENANT_ID } from "@/lib/tenant-context";
import { toResponse } from "@/lib/admin-services/http";
import { getLinkTreeAnalytics } from "@/lib/admin-services/linktree";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Raw pg bypasses the scoped client — every query is filtered by tenant.
    const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
    return toResponse(await getLinkTreeAnalytics(tenantId));
  } catch (err) {
    console.error("[linktree analytics]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
