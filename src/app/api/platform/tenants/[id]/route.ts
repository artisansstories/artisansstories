import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, platformAuthErrorResponse } from "@/lib/platform-auth";
import {
  CHECKOUT_MODES,
  TENANT_STATUSES,
  type CheckoutMode,
  type TenantStatusValue,
} from "@/lib/platform-tenants";

/**
 * /api/platform/tenants/[id] — single-tenant read / update (P6)
 *
 *   GET   → tenant detail incl. theme, Stripe status flags, API-key + product counts.
 *   PATCH → update name / status / platformFeeBps / checkoutMode.
 *
 * AUTH: requirePlatformAdmin (platform-owner admin session).
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformAdmin(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      isPlatformOwner: true,
      platformFeeBps: true,
      checkoutMode: true,
      stripeConnectAccountId: true,
      stripeOnboarded: true,
      createdAt: true,
      updatedAt: true,
      theme: true,
      _count: { select: { apiKeys: true } },
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const productCount = await prisma.product.count({ where: { tenantId: id } });
  const activeApiKeyCount = await prisma.tenantApiKey.count({
    where: { tenantId: id, revokedAt: null },
  });

  const { _count, theme, stripeConnectAccountId, ...rest } = tenant;

  return NextResponse.json({
    ...rest,
    stripe: {
      connected: Boolean(stripeConnectAccountId),
      accountId: stripeConnectAccountId,
      onboarded: tenant.stripeOnboarded,
    },
    theme,
    apiKeyCount: _count.apiKeys,
    activeApiKeyCount,
    productCount,
  });
}

interface PatchBody {
  name?: unknown;
  status?: unknown;
  platformFeeBps?: unknown;
  checkoutMode?: unknown;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformAdmin(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id } = await params;

  const existing = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const errors: string[] = [];
  const data: {
    name?: string;
    status?: TenantStatusValue;
    platformFeeBps?: number;
    checkoutMode?: CheckoutMode;
  } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) errors.push("`name` must be a non-empty string.");
    else data.name = name;
  }

  if (body.status !== undefined) {
    if (!TENANT_STATUSES.includes(body.status as TenantStatusValue)) {
      errors.push(`\`status\` must be one of: ${TENANT_STATUSES.join(", ")}.`);
    } else {
      data.status = body.status as TenantStatusValue;
    }
  }

  if (body.platformFeeBps !== undefined) {
    if (
      typeof body.platformFeeBps !== "number" ||
      !Number.isInteger(body.platformFeeBps) ||
      body.platformFeeBps < 0 ||
      body.platformFeeBps > 10_000
    ) {
      errors.push("`platformFeeBps` must be an integer between 0 and 10000.");
    } else {
      data.platformFeeBps = body.platformFeeBps;
    }
  }

  if (body.checkoutMode !== undefined) {
    if (!CHECKOUT_MODES.includes(body.checkoutMode as CheckoutMode)) {
      errors.push(`\`checkoutMode\` must be one of: ${CHECKOUT_MODES.join(", ")}.`);
    } else {
      data.checkoutMode = body.checkoutMode as CheckoutMode;
    }
  }

  if (errors.length) {
    return NextResponse.json({ error: "validation_failed", errors }, { status: 400 });
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_fields", message: "No updatable fields supplied." }, { status: 400 });
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      platformFeeBps: true,
      checkoutMode: true,
      stripeOnboarded: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(tenant);
}
