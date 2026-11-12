import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { resolveTenantFromAdminSession, DEFAULT_TENANT_ID } from "@/lib/tenant-context";
import { listKbArticles } from "@/lib/admin-services/kb";
import { toResponse } from "@/lib/admin-services/http";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await requireAdminSession();
  // Raw pg bypasses the scoped client — filter every query by tenant.
  const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const category = searchParams.get("category")?.trim() ?? "";

  return toResponse(await listKbArticles(tenantId, { search, category }));
}
