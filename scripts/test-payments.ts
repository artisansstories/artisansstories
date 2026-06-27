/**
 * test-payments.ts — Stripe Connect payments test (P4, Gate D)
 *
 * Layered and intentionally NON-FLAKY:
 *   1. Unit    (always) — computeApplicationFee math, pure, no network.
 *   2. Wiring  (always) — drive the real checkout/session route handler for a
 *                         not-onboarded connect tenant (→ 409
 *                         tenant_stripe_not_onboarded) and an embedded tenant
 *                         (→ 409 checkout_mode_embedded, never touches Connect).
 *   3. Live    (opt-in) — only if STRIPE_SECRET_KEY starts with sk_test_ AND
 *                         STRIPE_LIVE_TEST=1: create a real test Connect account
 *                         + onboarding link against the Stripe test API. KYC is
 *                         not automatable, so we stop after link generation.
 *                         Skipped otherwise (prints LIVE_STRIPE_SKIPPED).
 *
 * Run:  npx tsx scripts/test-payments.ts  → prints PAYMENTS_PASS, exit 0
 */
import * as path from "path";
import * as fs from "fs";

// Load env BEFORE importing anything that touches DATABASE_URL / STRIPE_*.
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

const TENANT_CONNECT = "__pay_connect";
const TENANT_EMBEDDED = "__pay_embedded";
const RAW_CONNECT = "oss_test_paymentsconnect";
const RAW_EMBEDDED = "oss_test_paymentsembedded";

function fail(reason: string): never {
  console.log(`PAYMENTS_FAIL: ${reason}`);
  process.exit(1);
}

function assert(cond: unknown, msg: string) {
  if (!cond) fail(msg);
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  // ── 1. Unit: computeApplicationFee ─────────────────────────────────────────
  const { computeApplicationFee } = await import("../src/lib/stripe-connect");

  // 3% of $100.00 → exactly $3.00
  assert(computeApplicationFee(10000, 300) === 300, `fee(10000,300)=${computeApplicationFee(10000, 300)}, expected 300`);
  // 2.5% of $25.99 = 64.975 → floored to 64 (platform never over-collects)
  assert(computeApplicationFee(2599, 250) === 64, `fee(2599,250)=${computeApplicationFee(2599, 250)}, expected 64`);
  // Zero / negative / default-bps edges
  assert(computeApplicationFee(0, 300) === 0, "fee(0,300) must be 0");
  assert(computeApplicationFee(10000, 0) === 0, "fee(10000,0) must be 0");
  assert(computeApplicationFee(-100, 300) === 0, "fee(-100,300) must be 0");
  assert(computeApplicationFee(99, 300) === 2, `fee(99,300)=${computeApplicationFee(99, 300)}, expected 2 (2.97→2)`);
  assert(computeApplicationFee(33333, 300) === 999, `fee(33333,300)=${computeApplicationFee(33333, 300)}, expected 999`);
  console.log("UNIT_FEE_PASS");

  const { prisma } = await import("../src/lib/prisma");
  const { getTenantPrisma } = await import("../src/lib/tenant-prisma");
  const { hashApiKey } = await import("../src/lib/api-key");
  const { NextRequest } = await import("next/server");
  const checkoutRoute = await import("../src/app/api/v1/store/checkout/session/route");

  const base = "http://localhost";

  try {
    // ── Setup: two throwaway tenants, each with an ACTIVE variant + full key ──
    await prisma.tenant.upsert({
      where: { id: TENANT_CONNECT },
      update: { checkoutMode: "connect_redirect", stripeOnboarded: false, stripeConnectAccountId: null },
      create: {
        id: TENANT_CONNECT,
        slug: "__pay-connect",
        name: "Pay Connect (not onboarded)",
        checkoutMode: "connect_redirect",
        stripeOnboarded: false,
      },
    });
    await prisma.tenant.upsert({
      where: { id: TENANT_EMBEDDED },
      update: { checkoutMode: "embedded" },
      create: {
        id: TENANT_EMBEDDED,
        slug: "__pay-embedded",
        name: "Pay Embedded",
        checkoutMode: "embedded",
      },
    });

    async function ensureKeyAndVariant(tenantId: string, raw: string): Promise<string> {
      const keyHash = hashApiKey(raw);
      await prisma.tenantApiKey.upsert({
        where: { keyHash },
        update: { scopes: ["store:read", "checkout:create"], revokedAt: null },
        create: {
          tenantId,
          name: "P4 payments test",
          keyHash,
          prefix: raw.slice(0, 12),
          scopes: ["store:read", "checkout:create"],
        },
      });

      let variant = await prisma.productVariant.findFirst({
        where: { tenantId, product: { status: "ACTIVE" } },
        select: { id: true },
      });
      if (!variant) {
        const tdb = getTenantPrisma(tenantId);
        const product = await tdb.product.create({
          data: {
            tenantId,
            slug: `__paysmoke-${tenantId}`,
            name: "Pay Smoke Product",
            status: "ACTIVE",
            price: 5000,
            variants: { create: [{ tenantId, name: "Default", optionValues: {}, position: 0 }] },
          } as never,
          include: { variants: { select: { id: true } } },
        });
        variant = { id: product.variants[0].id };
      }
      return variant.id;
    }

    const connectVariant = await ensureKeyAndVariant(TENANT_CONNECT, RAW_CONNECT);
    const embeddedVariant = await ensureKeyAndVariant(TENANT_EMBEDDED, RAW_EMBEDDED);

    // ── 2a. connect_redirect tenant, NOT onboarded → 409 not_onboarded ───────
    {
      const res = await checkoutRoute.POST(
        new NextRequest(`${base}/api/v1/store/checkout/session`, {
          method: "POST",
          headers: { ...bearer(RAW_CONNECT), "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ variantId: connectVariant, quantity: 1 }],
            successUrl: "https://shop.example/success",
            cancelUrl: "https://shop.example/cancel",
          }),
        }),
      );
      assert(res.status === 409, `not-onboarded checkout status ${res.status}, expected 409`);
      const body = await res.json();
      assert(body.ok === false, "not-onboarded checkout should return ok:false");
      assert(
        body.error === "tenant_stripe_not_onboarded",
        `not-onboarded error=${body.error}, expected tenant_stripe_not_onboarded`,
      );
      assert(body.onboardingRequired === true, "not-onboarded should set onboardingRequired:true");

      // No PENDING order should have been created (we short-circuit before that).
      const orders = await prisma.order.count({ where: { tenantId: TENANT_CONNECT } });
      assert(orders === 0, `not-onboarded path created ${orders} orders, expected 0`);
    }
    console.log("WIRING_NOT_ONBOARDED_PASS");

    // ── 2b. embedded tenant → 409 checkout_mode_embedded, no Connect attempt ─
    {
      const res = await checkoutRoute.POST(
        new NextRequest(`${base}/api/v1/store/checkout/session`, {
          method: "POST",
          headers: { ...bearer(RAW_EMBEDDED), "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ variantId: embeddedVariant, quantity: 1 }],
            successUrl: "https://shop.example/success",
            cancelUrl: "https://shop.example/cancel",
          }),
        }),
      );
      assert(res.status === 409, `embedded checkout status ${res.status}, expected 409`);
      const body = await res.json();
      assert(
        body.error === "checkout_mode_embedded",
        `embedded error=${body.error}, expected checkout_mode_embedded`,
      );
      assert(body.mode === "embedded", "embedded path should report mode:embedded");

      const orders = await prisma.order.count({ where: { tenantId: TENANT_EMBEDDED } });
      assert(orders === 0, `embedded path created ${orders} orders, expected 0`);
    }
    console.log("WIRING_EMBEDDED_PASS");

    // ── 3. Live Stripe (opt-in) ──────────────────────────────────────────────
    const secret = process.env.STRIPE_SECRET_KEY ?? "";
    if (secret.startsWith("sk_test_") && process.env.STRIPE_LIVE_TEST === "1") {
      const { createConnectAccount, createAccountOnboardingLink, stripe } = await import(
        "../src/lib/stripe-connect"
      );
      let acctId: string | null = null;
      try {
        acctId = await createConnectAccount({
          id: TENANT_CONNECT,
          stripeConnectAccountId: null,
          stripeOnboarded: false,
          platformFeeBps: 300,
          checkoutMode: "connect_redirect",
        });
        assert(typeof acctId === "string" && acctId.startsWith("acct_"), `bad account id: ${acctId}`);

        const url = await createAccountOnboardingLink(
          acctId,
          "https://shop.example/connect/refresh",
          "https://shop.example/connect/return",
        );
        assert(typeof url === "string" && url.startsWith("https://"), `bad onboarding url: ${url}`);
        console.log("LIVE_STRIPE_PASS");
      } finally {
        // Best-effort cleanup — test Connect accounts can usually be deleted.
        if (acctId) {
          try {
            await stripe.accounts.del(acctId);
          } catch {
            /* accounts can't always be deleted — ok to leave */
          }
        }
      }
    } else {
      console.log("LIVE_STRIPE_SKIPPED");
    }

    console.log("PAYMENTS_PASS");
  } finally {
    // Cleanup throwaway tenants, keys, products, orders.
    try {
      for (const tid of [TENANT_CONNECT, TENANT_EMBEDDED]) {
        await prisma.orderItem.deleteMany({ where: { tenantId: tid } });
        await prisma.order.deleteMany({ where: { tenantId: tid } });
        await prisma.productVariant.deleteMany({ where: { tenantId: tid } });
        await prisma.product.deleteMany({ where: { tenantId: tid } });
        await prisma.tenantApiKey.deleteMany({ where: { tenantId: tid } });
        await prisma.tenant.deleteMany({ where: { id: tid } });
      }
    } catch (err) {
      console.error("cleanup warning:", err);
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.log(`PAYMENTS_FAIL: ${err?.message ?? "unexpected error"}`);
  console.error(err);
  process.exit(1);
});
