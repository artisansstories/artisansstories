import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import { DEFAULT_THEME, resolveTheme, validateThemeInput } from "@/lib/theme";

/**
 * /api/platform/tenants/[id]/theme — platform-admin theme management (P5)
 *
 *   GET  → the tenant's theme (or platform defaults if no row exists).
 *   PUT  → validate the body with the theming guardrails, then upsert the
 *          TenantTheme. 400 + { errors } on any validation failure.
 *
 * AUTH (P10): operator-only via `requirePlatformOperator` (the `as-platform-session`
 * cookie). Theming another tenant's storefront is a platform-operator action; it
 * no longer reads `isPlatformOwner` or any store-admin session.
 *
 * TenantTheme is NOT in TENANT_SCOPED_MODELS, so we use the raw `prisma` client
 * and key explicitly by `tenantId`.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

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
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

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
