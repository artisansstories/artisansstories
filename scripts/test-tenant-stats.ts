/**
 * test-tenant-stats.ts — per-tenant ops aggregate proof (Phase A6 / P1-3)
 *
 * Proves the tenant-detail stats (orders / paid revenue / customers) are correct,
 * with the PAID-ONLY revenue rule as the headline correctness risk:
 *
 *   • Seed a throwaway tenant with 3 customers, 2 PAID orders (1500 + 2500),
 *     1 REFUNDED order (1000, still "captured money") and 1 PENDING/unpaid order
 *     (9999, must NOT count toward revenue).
 *   • Assert getTenantStats(tenantId):
 *       ordersCount      == 4   (all orders)
 *       paidOrdersCount  == 3   (PAID + PAID + REFUNDED; PENDING excluded)
 *       paidRevenueCents == 5000 (1500 + 2500 + 1000; the 9999 PENDING excluded)
 *       customersCount   == 3
 *   • Assert the real detail GET handler surfaces the same `stats` block.
 *   • Empty-tenant control: a second tenant with no orders/customers → all zero.
 *   • Clean up everything.
 *
 * Run:  npx tsx scripts/test-tenant-stats.ts  → prints TENANT_STATS_PASS, exit 0
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
  console.error(`TENANT_STATS_FAIL: ${reason}`);
  process.exit(1);
}

function assert(cond: unknown, reason: string): asserts cond {
  if (!cond) fail(reason);
}

const OPERATOR_EMAIL = "__stats_op@test.local";
const TENANT = "__stats_tenant";
const TENANT_SLUG = "__stats-tenant";
const TENANT_EMPTY = "__stats_tenant_empty";
const TENANT_EMPTY_SLUG = "__stats-tenant-empty";
const ALL_TENANTS = [TENANT, TENANT_EMPTY];

function stubRequest(cookies: Record<string, string>) {
  return {
    cookies: {
      get(name: string) {
        return name in cookies ? { value: cookies[name] } : undefined;
      },
    },
  } as unknown as import("next/server").NextRequest;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getTenantStats } = await import("../src/lib/platform-tenant-stats");
  const { GET: tenantGET } = await import("../src/app/api/platform/tenants/[id]/route");
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
    await prisma.tenant.create({ data: { id, slug, name, status: "ACTIVE" } });
    await prisma.tenantTheme.create({ data: { tenantId: id } });
    await prisma.storeSettings.create({ data: { tenantId: id, storeName: name, storeEnabled: true } });
  }

  /** Seed an order with a known total + financial status (no customer needed). */
  async function seedOrder(tid: string, orderNumber: string, total: number, financialStatus: string) {
    await prisma.order.create({
      data: {
        tenantId: tid,
        orderNumber,
        email: `o${orderNumber}@${tid}.test`,
        shippingAddress: { city: "Town" },
        subtotal: total,
        total,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        financialStatus: financialStatus as any,
      },
    });
  }

  await cleanup(prisma);

  try {
    const operator = await prisma.platformOperator.create({
      data: { email: OPERATOR_EMAIL, name: "Stats Operator", isActive: true },
    });
    const cookie = await mintOperatorCookie({ id: operator.id, email: operator.email, name: operator.name });
    const auth = { "as-platform-session": cookie };

    await createTenant(TENANT, TENANT_SLUG, "Stats Tenant");
    await createTenant(TENANT_EMPTY, TENANT_EMPTY_SLUG, "Stats Empty");

    // 3 customers.
    for (let i = 0; i < 3; i++) {
      await prisma.customer.create({ data: { tenantId: TENANT, email: `c${i}@${TENANT}.test` } });
    }

    // 2 PAID (1500 + 2500) + 1 REFUNDED (1000) all count as captured money;
    // 1 PENDING (9999) must NOT count toward revenue but IS an order.
    await seedOrder(TENANT, "1001", 1500, "PAID");
    await seedOrder(TENANT, "1002", 2500, "PAID");
    await seedOrder(TENANT, "1003", 1000, "REFUNDED");
    await seedOrder(TENANT, "1004", 9999, "PENDING");

    const EXPECT = { ordersCount: 4, paidOrdersCount: 3, paidRevenueCents: 5000, customersCount: 3 };

    // ── 1. Aggregate helper (the core correctness — paid-only revenue) ─────────
    const stats = await getTenantStats(TENANT);
    assert(stats.ordersCount === EXPECT.ordersCount, `1: ordersCount expected ${EXPECT.ordersCount}, got ${stats.ordersCount}`);
    assert(stats.paidOrdersCount === EXPECT.paidOrdersCount, `1: paidOrdersCount expected ${EXPECT.paidOrdersCount}, got ${stats.paidOrdersCount}`);
    assert(stats.paidRevenueCents === EXPECT.paidRevenueCents, `1: paidRevenueCents expected ${EXPECT.paidRevenueCents} (PAID-only, PENDING 9999 excluded), got ${stats.paidRevenueCents}`);
    assert(stats.customersCount === EXPECT.customersCount, `1: customersCount expected ${EXPECT.customersCount}, got ${stats.customersCount}`);

    // ── 2. Detail GET handler surfaces the same stats block ───────────────────
    const res = await tenantGET(stubRequest(auth), { params: Promise.resolve({ id: TENANT }) });
    assert(res.status === 200, `2: detail GET expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.stats, "2: detail GET body must include a stats block");
    assert(body.stats.paidRevenueCents === EXPECT.paidRevenueCents, `2: GET stats.paidRevenueCents expected ${EXPECT.paidRevenueCents}, got ${body.stats.paidRevenueCents}`);
    assert(body.stats.ordersCount === EXPECT.ordersCount, `2: GET stats.ordersCount expected ${EXPECT.ordersCount}, got ${body.stats.ordersCount}`);
    assert(body.stats.paidOrdersCount === EXPECT.paidOrdersCount, `2: GET stats.paidOrdersCount expected ${EXPECT.paidOrdersCount}, got ${body.stats.paidOrdersCount}`);
    assert(body.stats.customersCount === EXPECT.customersCount, `2: GET stats.customersCount expected ${EXPECT.customersCount}, got ${body.stats.customersCount}`);

    // ── 3. Empty-tenant control → all zero (no NaN from null _sum) ─────────────
    const empty = await getTenantStats(TENANT_EMPTY);
    assert(empty.ordersCount === 0 && empty.paidOrdersCount === 0 && empty.paidRevenueCents === 0 && empty.customersCount === 0, `3: empty tenant must be all-zero, got ${JSON.stringify(empty)}`);

    console.log("TENANT_STATS_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  try {
    for (const tid of ALL_TENANTS) {
      await prisma.order.deleteMany({ where: { tenantId: tid } });
      await prisma.customer.deleteMany({ where: { tenantId: tid } });
      await prisma.storeSettings.deleteMany({ where: { tenantId: tid } });
      await prisma.tenantTheme.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await prisma.platformOperator.deleteMany({ where: { email: OPERATOR_EMAIL } });
  } catch (err) {
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("TENANT_STATS_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
