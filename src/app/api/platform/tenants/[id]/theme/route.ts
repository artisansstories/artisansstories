import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-auth";
import { DEFAULT_THEME, resolveTheme, validateThemeInput } from "@/lib/theme";

/**
 * /api/platform/tenants/[id]/theme — platform-admin theme management (P5)
 *
 *   GET  → the tenant's theme (or platform defaults if no row exists).
 *   PUT  → validate the body with the theming guardrails, then upsert the
 *          TenantTheme. 400 + { errors } on any validation failure.
 *
 * AUTH posture matches the sibling Stripe Connect route: a valid admin session
 * that belongs to the platform-owner tenant (`isPlatformOwner = true`). Theming
 * another tenant's storefront is a platform-operator action, not something an
 * arbitrary tenant admin should do to an arbitrary tenant id.
 *
 * TenantTheme is NOT in TENANT_SCOPED_MODELS, so we use the raw `prisma` client
 * and key explicitly by `tenantId`.
 */

async function requirePlatformOwner(): Promise<
  { ok: true } | { ok: false; res: NextResponse }
> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  // Resolve the admin's tenant (sessions minted before P2 carry no tenantId).
  let adminTenantId = (session as { tenantId?: string }).tenantId;
  if (!adminTenantId) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: session.id },
      select: { tenantId: true },
    });
    adminTenantId = admin?.tenantId ?? undefined;
  }

  const ownerTenant = adminTenantId
    ? await prisma.tenant.findUnique({
        where: { id: adminTenantId },
        select: { isPlatformOwner: true },
      })
    : null;

  if (!ownerTenant?.isPlatformOwner) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "forbidden", message: "Theme management is restricted to platform-owner admins." },
        { status: 403 },
      ),
    };
  }

  return { ok: true };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.res;

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const row = await prisma.tenantTheme.findUnique({ where: { tenantId } });
  const theme = resolveTheme(row ?? undefined);

  return NextResponse.json({
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    theme,
    isDefault: row === null,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.res;

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", errors: ["Request body must be valid JSON."] },
      { status: 400 },
    );
  }

  const { ok, errors, value } = validateThemeInput(body);
  if (!ok) {
    return NextResponse.json({ error: "validation_failed", errors }, { status: 400 });
  }

  const theme = await prisma.tenantTheme.upsert({
    where: { tenantId },
    create: { tenantId, ...value },
    update: { ...value },
  });

  return NextResponse.json({
    tenant: { id: tenantId },
    theme: resolveTheme(theme),
    defaults: DEFAULT_THEME,
  });
}
