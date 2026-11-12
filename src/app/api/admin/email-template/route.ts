import { NextResponse } from "next/server";
import { resolveTenantFromAdminSession, DEFAULT_TENANT_ID } from "@/lib/tenant-context";
import { toResponse } from "@/lib/admin-services/http";
import { getEmailTemplate, saveEmailTemplate } from "@/lib/admin-services/email-template";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Raw `pg` SQL bypasses the scoped Prisma client; WelcomeEmailTemplate is
// one-per-tenant, so each statement is scoped to the admin's tenant by hand
// (see src/lib/admin-services/email-template.ts).

export async function GET() {
  try {
    const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
    return toResponse(await getEmailTemplate(tenantId));
  } catch (error) {
    console.error("Failed to fetch email template:", error);
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
    const body = await req.json();
    return toResponse(await saveEmailTemplate(tenantId, body));
  } catch (error) {
    console.error("Failed to save email template:", error);
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  }
}
