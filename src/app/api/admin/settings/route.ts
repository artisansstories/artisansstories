import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";

/**
 * Read the per-tenant email branding fields off TenantTheme (a platform/global
 * model, NOT tenant-scoped — see tenant-prisma.ts). Returned alongside the
 * StoreSettings so the admin Settings page can populate its "Email" section.
 */
async function getEmailBrandingFields(tenantId: string) {
  const theme = await prisma.tenantTheme.findUnique({
    where: { tenantId },
    select: {
      emailFromName: true,
      emailReplyTo: true,
      emailAccentColor: true,
      emailLogoUrl: true,
    },
  });
  return {
    emailFromName: theme?.emailFromName ?? null,
    emailReplyTo: theme?.emailReplyTo ?? null,
    emailAccentColor: theme?.emailAccentColor ?? null,
    emailLogoUrl: theme?.emailLogoUrl ?? null,
  };
}

export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();

    const emailBranding = await getEmailBrandingFields(db.$tenantId);

    const settings = await db.storeSettings.findUnique({ where: { id: "singleton" } });
    if (!settings) {
      // Create default if missing
      const created = await db.storeSettings.create({ data: { id: "singleton", tenantId: db.$tenantId } });
      return NextResponse.json({ ...created, ...emailBranding });
    }
    return NextResponse.json({ ...settings, ...emailBranding });
  } catch (error) {
    console.error("GET /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
export async function PUT(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const body = await request.json();
    // Remove read-only fields
    delete body.id;
    delete body.createdAt;
    delete body.updatedAt;
    // Email branding lives on TenantTheme, not StoreSettings — strip it out here
    // so the StoreSettings upsert doesn't choke on unknown columns. The Email
    // section saves through PATCH below.
    delete body.emailFromName;
    delete body.emailReplyTo;
    delete body.emailAccentColor;
    delete body.emailLogoUrl;
    const settings = await db.storeSettings.upsert({
      where: { id: "singleton" },
      update: body,
      create: { id: "singleton", ...body },
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error("PUT /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/settings — update the tenant's email branding (E1).
 *
 * These four fields live on TenantTheme (a platform/global model), so we upsert
 * by tenantId on the raw client rather than the tenant-scoped one. Empty strings
 * are normalized to null so "leave blank to use the store default" works.
 */
export async function PATCH(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    const body = await request.json();

    const norm = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      return trimmed.length ? trimmed : null;
    };

    const data = {
      emailFromName: norm(body.emailFromName),
      emailReplyTo: norm(body.emailReplyTo),
      emailAccentColor: norm(body.emailAccentColor),
      emailLogoUrl: norm(body.emailLogoUrl),
    };

    const theme = await prisma.tenantTheme.upsert({
      where: { tenantId: db.$tenantId },
      update: data,
      create: { tenantId: db.$tenantId, ...data },
      select: {
        emailFromName: true,
        emailReplyTo: true,
        emailAccentColor: true,
        emailLogoUrl: true,
      },
    });

    return NextResponse.json(theme);
  } catch (error) {
    console.error("PATCH /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
