import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import { DEFAULT_THEME, resolveTheme } from "@/lib/theme";

/**
 * GET /api/platform/tenants/[id]/onboarding-status — the derived onboarding map (O1)
 *
 * The single source of truth for the onboarding "process train". Every step's
 * completion is COMPUTED from data that already exists (no new column, no drift):
 *
 *   create      → the tenant row resolves
 *   branding    → TenantTheme differs from DEFAULT_THEME (optional, non-blocking)
 *   stripe      → tenant.stripeOnboarded === true
 *   products    → Product.count({tenantId}) > 0
 *   apiKey      → TenantApiKey.count({tenantId, revokedAt:null}) > 0
 *   integration → mirrors apiKey.done (the page is generatable once a key exists)
 *   goLive      → StoreSettings.storeEnabled === true   (gated on stripe + products)
 *
 * AUTH: requirePlatformOperator — operator `as-platform-session` cookie (P10).
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

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      stripeConnectAccountId: true,
      stripeOnboarded: true,
      theme: true,
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const [productCount, activeApiKeyCount, settings] = await Promise.all([
    prisma.product.count({ where: { tenantId: id } }),
    prisma.tenantApiKey.count({ where: { tenantId: id, revokedAt: null } }),
    prisma.storeSettings.findUnique({
      where: { tenantId: id },
      select: { storeEnabled: true },
    }),
  ]);

  // Branding: the theme row is seeded with all schema defaults at create, so a
  // resolved theme equal to DEFAULT_THEME means "still using defaults".
  const resolved = resolveTheme(tenant.theme ?? undefined);
  const usingDefaults = (Object.keys(DEFAULT_THEME) as (keyof typeof DEFAULT_THEME)[]).every(
    (k) => resolved[k] === DEFAULT_THEME[k],
  );
  const brandingDone = !usingDefaults;

  // Stripe state machine derived from the two tenant fields.
  const stripeState: "none" | "in_progress" | "onboarded" = tenant.stripeOnboarded
    ? "onboarded"
    : tenant.stripeConnectAccountId
      ? "in_progress"
      : "none";
  const stripeDone = tenant.stripeOnboarded;

  const productsDone = productCount > 0;
  const apiKeyDone = activeApiKeyCount > 0;
  const integrationDone = apiKeyDone;
  const storeEnabled = settings?.storeEnabled ?? false;
  const goLiveDone = storeEnabled;

  // Go-live prerequisites enforced server-side (api key is recommended, not required).
  const blockedBy: string[] = [];
  if (!stripeDone) blockedBy.push("stripe");
  if (!productsDone) blockedBy.push("products");

  const steps = {
    create: { done: true },
    branding: { done: brandingDone, optional: true, usingDefaults },
    stripe: { done: stripeDone, state: stripeState, accountId: tenant.stripeConnectAccountId },
    products: { done: productsDone, count: productCount },
    apiKey: { done: apiKeyDone, activeCount: activeApiKeyCount },
    integration: { done: integrationDone },
    goLive: { done: goLiveDone, blockedBy },
  };

  // currentStep = first non-done step, SKIPPING optional branding; "complete" if live.
  const order: Array<"create" | "stripe" | "products" | "apiKey" | "integration" | "goLive"> = [
    "create",
    "stripe",
    "products",
    "apiKey",
    "integration",
    "goLive",
  ];
  const currentStep = order.find((s) => !steps[s].done) ?? "complete";

  // completedCount: a step counts when it is done OR optional (branding is always
  // "satisfied" since it never blocks). total is the full 7-step train.
  const completedCount = Object.values(steps).filter(
    (s) => s.done || ("optional" in s && s.optional),
  ).length;

  return NextResponse.json({
    tenantId: tenant.id,
    slug: tenant.slug,
    storeEnabled,
    steps,
    currentStep,
    completedCount,
    total: 7,
  });
}
