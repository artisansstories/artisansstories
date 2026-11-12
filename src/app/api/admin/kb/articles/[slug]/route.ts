import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { resolveTenantFromAdminSession, DEFAULT_TENANT_ID } from "@/lib/tenant-context";
import { getKbArticle, updateKbArticle } from "@/lib/admin-services/kb";
import { toResponse } from "@/lib/admin-services/http";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  await requireAdminSession();
  // Raw pg bypasses the scoped client — scope by tenant (slug is per-tenant unique).
  const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
  const { slug } = await params;

  return toResponse(await getKbArticle(tenantId, slug));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  await requireAdminSession();
  const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
  const { slug } = await params;

  const body = await req.json();

  return toResponse(await updateKbArticle(tenantId, slug, body));
}
