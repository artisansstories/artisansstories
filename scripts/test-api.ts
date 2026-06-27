/**
 * test-api.ts — v1 Storefront API smoke test (P3, Gate B)
 *
 * Mints test API keys for tenant zero, then exercises the real Next route
 * handlers by importing each route module and invoking its exported GET/POST
 * with a constructed NextRequest (Authorization header set). Asserts response
 * shapes, auth (401), and scope enforcement (403).
 *
 * Run:  npx tsx scripts/test-api.ts   → prints API_SMOKE_PASS, exit 0
 */
import * as path from "path";
import * as fs from "fs";

// Load env BEFORE importing anything that touches DATABASE_URL.
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
const root = path.resolve(__dirname, "..");
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

const TENANT_ZERO = "tenant_artisans_stories";
const RAW_FULL = "oss_test_p3smoke";
const RAW_READONLY = "oss_test_p3readonly";

function fail(reason: string): never {
  console.log(`API_SMOKE_FAIL: ${reason}`);
  process.exit(1);
}

function bearer(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getTenantPrisma } = await import("../src/lib/tenant-prisma");
  const { hashApiKey } = await import("../src/lib/api-key");
  const { NextRequest } = await import("next/server");

  // Route modules (real handlers under test).
  const themeRoute = await import("../src/app/api/v1/store/theme/route");
  const productsRoute = await import("../src/app/api/v1/store/products/route");
  const featuredRoute = await import("../src/app/api/v1/store/products/featured/route");
  const categoriesRoute = await import("../src/app/api/v1/store/categories/route");
  const checkoutRoute = await import("../src/app/api/v1/store/checkout/session/route");

  // Track temp data for cleanup.
  let tempProductId: string | null = null;

  try {
    // ── Setup: tenant zero + two test keys (upsert → rerunnable) ────────────
    await prisma.tenant.upsert({
      where: { id: TENANT_ZERO },
      update: {},
      create: { id: TENANT_ZERO, slug: "artisans-stories", name: "Artisans Stories", isPlatformOwner: true },
    });

    const fullHash = hashApiKey(RAW_FULL);
    const roHash = hashApiKey(RAW_READONLY);
    await prisma.tenantApiKey.upsert({
      where: { keyHash: fullHash },
      update: { scopes: ["store:read", "checkout:create"], revokedAt: null },
      create: {
        tenantId: TENANT_ZERO,
        name: "P3 smoke (full)",
        keyHash: fullHash,
        prefix: RAW_FULL.slice(0, 12),
        scopes: ["store:read", "checkout:create"],
      },
    });
    await prisma.tenantApiKey.upsert({
      where: { keyHash: roHash },
      update: { scopes: ["store:read"], revokedAt: null },
      create: {
        tenantId: TENANT_ZERO,
        name: "P3 smoke (read-only)",
        keyHash: roHash,
        prefix: RAW_READONLY.slice(0, 12),
        scopes: ["store:read"],
      },
    });

    const base = "http://localhost";

    // ── 1. theme returns an object with primaryColor ────────────────────────
    {
      const res = await themeRoute.GET(
        new NextRequest(`${base}/api/v1/store/theme`, { headers: bearer(RAW_FULL) }),
      );
      if (res.status !== 200) fail(`theme status ${res.status}, expected 200`);
      const body = await res.json();
      if (!body.theme || typeof body.theme.primaryColor !== "string") {
        fail("theme response missing theme.primaryColor");
      }
    }

    // ── 2. products returns { products: Array, total: number } ──────────────
    {
      const res = await productsRoute.GET(
        new NextRequest(`${base}/api/v1/store/products?limit=5`, { headers: bearer(RAW_FULL) }),
      );
      if (res.status !== 200) fail(`products status ${res.status}, expected 200`);
      const body = await res.json();
      if (!Array.isArray(body.products)) fail("products.products is not an array");
      if (typeof body.total !== "number") fail("products.total is not a number");
    }

    // ── 3. featured returns an array ────────────────────────────────────────
    {
      const res = await featuredRoute.GET(
        new NextRequest(`${base}/api/v1/store/products/featured`, { headers: bearer(RAW_FULL) }),
      );
      if (res.status !== 200) fail(`featured status ${res.status}, expected 200`);
      const body = await res.json();
      if (!Array.isArray(body.products)) fail("featured.products is not an array");
    }

    // ── 4. categories returns an array (extra coverage) ─────────────────────
    {
      const res = await categoriesRoute.GET(
        new NextRequest(`${base}/api/v1/store/categories`, { headers: bearer(RAW_FULL) }),
      );
      if (res.status !== 200) fail(`categories status ${res.status}, expected 200`);
      const body = await res.json();
      if (!Array.isArray(body.categories)) fail("categories.categories is not an array");
    }

    // ── 5. no/bad token → 401 ───────────────────────────────────────────────
    {
      const noTok = await themeRoute.GET(new NextRequest(`${base}/api/v1/store/theme`));
      if (noTok.status !== 401) fail(`no-token theme status ${noTok.status}, expected 401`);
      const badTok = await themeRoute.GET(
        new NextRequest(`${base}/api/v1/store/theme`, { headers: bearer("oss_test_not_a_real_key") }),
      );
      if (badTok.status !== 401) fail(`bad-token theme status ${badTok.status}, expected 401`);
    }

    // ── Ensure tenant zero has an ACTIVE variant for the checkout test ──────
    let variant = await prisma.productVariant.findFirst({
      where: { tenantId: TENANT_ZERO, product: { status: "ACTIVE" } },
      select: { id: true },
    });
    if (!variant) {
      // No active variant seeded — create a throwaway via the scoped client.
      const tdb = getTenantPrisma(TENANT_ZERO);
      const product = await tdb.product.create({
        data: {
          tenantId: TENANT_ZERO,
          slug: `__p3smoke-${fullHash.slice(0, 8)}`,
          name: "P3 Smoke Product",
          status: "ACTIVE",
          price: 1234,
          variants: {
            create: [{ tenantId: TENANT_ZERO, name: "Default", optionValues: {}, position: 0 }],
          },
        } as never,
        include: { variants: { select: { id: true } } },
      });
      tempProductId = product.id;
      variant = { id: product.variants[0].id };
    }

    // ── 6. checkout with valid scope + valid variant → defined P4 contract ──
    // Tenant zero is checkoutMode="embedded", so the v1 Connect-redirect endpoint
    // returns a 409 embedded contract (it keeps its existing embedded
    // PaymentIntent flow and must NOT open a Connect session). We assert the
    // endpoint passed validation/pricing and short-circuited with that contract
    // — not the old stub.
    {
      const res = await checkoutRoute.POST(
        new NextRequest(`${base}/api/v1/store/checkout/session`, {
          method: "POST",
          headers: { ...bearer(RAW_FULL), "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ variantId: variant.id, quantity: 2 }],
            successUrl: "https://shop.example/success",
            cancelUrl: "https://shop.example/cancel",
          }),
        }),
      );
      if (res.status !== 409) fail(`checkout status ${res.status}, expected 409 (embedded tenant)`);
      const body = await res.json();
      if (body.ok !== false) fail("embedded checkout should return ok:false");
      if (body.error !== "checkout_mode_embedded") {
        fail(`checkout error=${body.error}, expected checkout_mode_embedded`);
      }
    }

    // ── 7. checkout with store:read-only key → 403 ──────────────────────────
    {
      const res = await checkoutRoute.POST(
        new NextRequest(`${base}/api/v1/store/checkout/session`, {
          method: "POST",
          headers: { ...bearer(RAW_READONLY), "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ variantId: variant.id, quantity: 1 }],
            successUrl: "https://shop.example/success",
            cancelUrl: "https://shop.example/cancel",
          }),
        }),
      );
      if (res.status !== 403) fail(`read-only checkout status ${res.status}, expected 403`);
    }

    console.log("API_SMOKE_PASS");
  } finally {
    // Cleanup: drop test keys and any throwaway product.
    try {
      await prisma.tenantApiKey.deleteMany({
        where: { keyHash: { in: [hashApiKey(RAW_FULL), hashApiKey(RAW_READONLY)] } },
      });
      if (tempProductId) {
        await prisma.productVariant.deleteMany({ where: { productId: tempProductId } });
        await prisma.product.deleteMany({ where: { id: tempProductId } });
      }
    } catch (err) {
      console.error("cleanup warning:", err);
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.log(`API_SMOKE_FAIL: ${err?.message ?? "unexpected error"}`);
  console.error(err);
  process.exit(1);
});
