/**
 * test-onboarding-train.ts — the automated onboarding "process train" gate (O1)
 *
 * Mints an operator session, then drives a FRESH tenant from nothing → live,
 * asserting the derived aggregator (`GET .../onboarding-status`) flips each step
 * exactly as the real operator wizard will read it. A second fresh tenant proves
 * the server-side go-live prerequisite gate (409 before stripe/products).
 *
 * Calls the REAL route handlers directly with a request stub carrying a minted
 * operator cookie (the dual cookie-jar path in requirePlatformOperator), exactly
 * like scripts/test-operator-authz.ts. No HTTP server required.
 *
 * Run:  npx tsx scripts/test-onboarding-train.ts  → prints ONBOARDING_TRAIN_PASS, exit 0
 */
import * as path from "path";
import * as fs from "fs";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const root = path.resolve(__dirname, "..");
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

function fail(reason: string): never {
  console.error(`ONBOARDING_TRAIN_FAIL: ${reason}`);
  process.exit(1);
}

function assert(cond: unknown, reason: string): asserts cond {
  if (!cond) fail(reason);
}

const OPERATOR_EMAIL = "__train_op@test.local";
const TENANT_A = "__train_tenant_a";
const TENANT_A_SLUG = "__train-tenant-a";
const TENANT_B = "__train_tenant_b";
const TENANT_B_SLUG = "__train-tenant-b";

/** A request stub exposing the cookie jar the operator gate reads, plus json(). */
function stubRequest(cookies: Record<string, string>, body?: unknown) {
  return {
    cookies: {
      get(name: string) {
        return name in cookies ? { value: cookies[name] } : undefined;
      },
    },
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  } as unknown as import("next/server").NextRequest;
}

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { GET: statusGET } = await import(
    "../src/app/api/platform/tenants/[id]/onboarding-status/route"
  );
  const { POST: productsPOST } = await import(
    "../src/app/api/platform/tenants/[id]/products/route"
  );
  const { POST: apiKeysPOST } = await import(
    "../src/app/api/platform/tenants/[id]/api-keys/route"
  );
  const { POST: goLivePOST } = await import(
    "../src/app/api/platform/tenants/[id]/go-live/route"
  );
  const { SignJWT } = await import("jose");

  const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

  async function mintOperatorCookie(claims: { id: string; email: string; name: string }) {
    return new SignJWT({ ...claims, kind: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(SECRET);
  }

  async function createTenant(id: string, slug: string, name: string) {
    // Mirror POST /api/platform/tenants: tenant + default theme + default settings.
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id, slug, name } });
      await tx.tenantTheme.create({ data: { tenantId: id } });
      await tx.storeSettings.create({ data: { tenantId: id, storeName: name } });
    });
  }

  await cleanup(prisma);

  try {
    const operator = await prisma.platformOperator.create({
      data: { email: OPERATOR_EMAIL, name: "Train Operator", isActive: true },
    });
    const cookie = await mintOperatorCookie({
      id: operator.id,
      email: operator.email,
      name: operator.name,
    });
    const auth = { "as-platform-session": cookie };

    async function getStatus(tenantId: string) {
      const res = await statusGET(stubRequest(auth), withParams(tenantId));
      assert(res.status === 200, `onboarding-status expected 200, got ${res.status}`);
      return res.json();
    }

    // ── Tenant A: nothing → live ────────────────────────────────────────────
    await createTenant(TENANT_A, TENANT_A_SLUG, "Train Tenant A");

    // 1. Fresh tenant: create done, currentStep stripe, goLive blocked by both.
    let s = await getStatus(TENANT_A);
    assert(s.steps.create.done === true, "1: create.done should be true");
    assert(s.currentStep === "stripe", `1: currentStep should be "stripe", got "${s.currentStep}"`);
    assert(
      Array.isArray(s.steps.goLive.blockedBy) &&
        s.steps.goLive.blockedBy.includes("stripe") &&
        s.steps.goLive.blockedBy.includes("products"),
      `1: goLive.blockedBy should include stripe+products, got ${JSON.stringify(s.steps.goLive.blockedBy)}`,
    );
    assert(s.steps.stripe.done === false, "1: stripe.done should be false");
    assert(s.steps.products.done === false, "1: products.done should be false");

    // 2. Simulate KYC (real Stripe KYC is un-automatable in CI).
    await prisma.tenant.update({
      where: { id: TENANT_A },
      data: { stripeOnboarded: true },
    });
    s = await getStatus(TENANT_A);
    assert(s.steps.stripe.done === true, "2: stripe.done should be true after KYC");
    assert(
      s.steps.stripe.state === "onboarded",
      `2: stripe.state should be "onboarded", got "${s.steps.stripe.state}"`,
    );
    assert(s.currentStep === "products", `2: currentStep should be "products", got "${s.currentStep}"`);

    // 3. Create a product.
    const pRes = await productsPOST(
      stubRequest(auth, { name: "Train Widget", price: 19.99, description: "demo" }),
      withParams(TENANT_A),
    );
    assert(pRes.status === 201, `3: products POST expected 201, got ${pRes.status}`);
    const pBody = await pRes.json();
    assert(pBody.priceCents === 1999, `3: priceCents should be 1999, got ${pBody.priceCents}`);
    s = await getStatus(TENANT_A);
    assert(s.steps.products.done === true, "3: products.done should be true");
    assert(s.steps.products.count === 1, `3: products.count should be 1, got ${s.steps.products.count}`);

    // 4. Mint an API key.
    const kRes = await apiKeysPOST(
      stubRequest(auth, { name: "Storefront integration" }),
      withParams(TENANT_A),
    );
    assert(kRes.status === 201, `4: api-keys POST expected 201, got ${kRes.status}`);
    s = await getStatus(TENANT_A);
    assert(s.steps.apiKey.done === true, "4: apiKey.done should be true");
    assert(s.steps.integration.done === true, "4: integration.done should mirror apiKey.done");

    // 5. Go live.
    const gRes = await goLivePOST(stubRequest(auth), withParams(TENANT_A));
    assert(gRes.status === 200, `5: go-live POST expected 200, got ${gRes.status}`);
    const gBody = await gRes.json();
    assert(gBody.storeEnabled === true, "5: go-live should return storeEnabled true");
    const settings = await prisma.storeSettings.findUnique({
      where: { tenantId: TENANT_A },
      select: { storeEnabled: true },
    });
    assert(settings?.storeEnabled === true, "5: StoreSettings.storeEnabled should be true in DB");
    s = await getStatus(TENANT_A);
    assert(s.steps.goLive.done === true, "5: goLive.done should be true");
    assert(s.completedCount === 7, `5: completedCount should be 7, got ${s.completedCount}`);
    assert(s.currentStep === "complete", `5: currentStep should be "complete", got "${s.currentStep}"`);

    // ── 6. Negative: a fresh tenant go-live before stripe/products → 409 ──────
    await createTenant(TENANT_B, TENANT_B_SLUG, "Train Tenant B");
    const nRes = await goLivePOST(stubRequest(auth), withParams(TENANT_B));
    assert(nRes.status === 409, `6: go-live expected 409 prerequisites_unmet, got ${nRes.status}`);
    const nBody = await nRes.json();
    assert(nBody.error === "prerequisites_unmet", `6: error should be prerequisites_unmet, got ${nBody.error}`);
    assert(
      Array.isArray(nBody.missing) &&
        nBody.missing.includes("stripe") &&
        nBody.missing.includes("products"),
      `6: missing should list both stripe+products, got ${JSON.stringify(nBody.missing)}`,
    );

    console.log("ONBOARDING_TRAIN_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  try {
    for (const tid of [TENANT_A, TENANT_B]) {
      // Products cascade to their variants + inventory; Tenant has no FK to
      // Product, so delete products explicitly. Theme/api-keys cascade on tenant
      // delete, but StoreSettings + audit log do not — clear them by tenantId.
      await prisma.product.deleteMany({ where: { tenantId: tid } });
      await prisma.storeSettings.deleteMany({ where: { tenantId: tid } });
      await prisma.platformAuditLog.deleteMany({ where: { tenantId: tid } });
      await prisma.tenantTheme.deleteMany({ where: { tenantId: tid } });
      await prisma.tenantApiKey.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await prisma.platformOperatorToken.deleteMany({ where: { email: OPERATOR_EMAIL } });
    await prisma.platformOperator.deleteMany({ where: { email: OPERATOR_EMAIL } });
  } catch (err) {
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("ONBOARDING_TRAIN_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
