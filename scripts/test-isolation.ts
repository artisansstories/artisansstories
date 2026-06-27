/**
 * test-isolation.ts — Tenant isolation proof (P2)
 *
 * Stands up two throwaway tenants, performs cross-tenant read/update/delete
 * attempts through the SCOPED client, and asserts that no tenant can see or
 * mutate another's rows. Also proves per-tenant composite uniqueness: the same
 * product slug and the same customer email can coexist across tenants.
 *
 * Run:  npx tsx scripts/test-isolation.ts   → prints ISOLATION_PASS, exit 0
 */
import * as path from "path";
import * as fs from "fs";

// Load env BEFORE importing anything that touches DATABASE_URL. The prisma
// module instantiates its client at import time, so env must be ready first.
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
  console.error(`ISOLATION_FAIL: ${reason}`);
  process.exit(1);
}

/**
 * Cast helper: the scoped extension injects `tenantId` at runtime, but the
 * client TYPES still demand it. We deliberately OMIT `tenantId` from the create
 * payload to PROVE the hook adds it (asserted below), so the data must be cast
 * to a type that claims `tenantId` is present even though the value is not.
 */
function omitTenant<T>(data: T): T & { tenantId: string } {
  return data as T & { tenantId: string };
}

const TENANT_A = "__iso_a";
const TENANT_B = "__iso_b";
const SLUG = "iso-test-tee";
const EMAIL = "iso@test.local";

async function main() {
  // Dynamic imports so the env loader above runs first.
  const { prisma } = await import("../src/lib/prisma");
  const { getTenantPrisma } = await import("../src/lib/tenant-prisma");

  // Best-effort pre-clean in case a prior run died mid-flight.
  await cleanup(prisma);

  try {
    // ── Setup: two tenants via the RAW client ──────────────────────────────
    await prisma.tenant.create({
      data: { id: TENANT_A, slug: "__iso-test-a", name: "Iso Test A" },
    });
    await prisma.tenant.create({
      data: { id: TENANT_B, slug: "__iso-test-b", name: "Iso Test B" },
    });

    const a = getTenantPrisma(TENANT_A);
    const b = getTenantPrisma(TENANT_B);

    // ── Each tenant creates a Category, a Product (SAME slug), a Customer
    //    (SAME email) through its SCOPED client. tenantId is auto-injected. ──
    await a.category.create({ data: omitTenant({ slug: "iso-cat", name: "Iso Cat A" }) });
    await b.category.create({ data: omitTenant({ slug: "iso-cat", name: "Iso Cat B" }) });

    const prodA = await a.product.create({
      data: omitTenant({ slug: SLUG, name: "Iso Tee A", price: 1000 }),
    });
    const prodB = await b.product.create({
      data: omitTenant({ slug: SLUG, name: "Iso Tee B", price: 2000 }),
    });

    if (!prodA?.id || !prodB?.id) {
      fail("both tenants could not create a product with the same slug");
    }

    // Auto-injection: neither create passed tenantId, yet each row must carry
    // its own tenant's id — proof the scoped client stamps writes.
    if (prodA.tenantId !== TENANT_A) {
      fail(`A's product was stamped tenantId=${prodA.tenantId}, expected ${TENANT_A}`);
    }
    if (prodB.tenantId !== TENANT_B) {
      fail(`B's product was stamped tenantId=${prodB.tenantId}, expected ${TENANT_B}`);
    }

    await a.customer.create({ data: omitTenant({ email: EMAIL }) });
    await b.customer.create({ data: omitTenant({ email: EMAIL }) });

    // ── Assertions ─────────────────────────────────────────────────────────

    // 1. Scoped A sees only A's product.
    const aProducts = await a.product.findMany();
    if (aProducts.length !== 1) {
      fail(`A.findMany returned ${aProducts.length} products, expected 1`);
    }
    if (aProducts[0].id !== prodA.id) {
      fail("A.findMany returned a product that is not A's");
    }
    if (aProducts.some((p) => p.id === prodB.id)) {
      fail("A.findMany leaked B's product");
    }

    // 2. Scoped A cannot fetch B's product by id.
    const stolen = await a.product.findFirst({ where: { id: prodB.id } });
    if (stolen !== null) {
      fail("A.findFirst was able to read B's product by id");
    }

    // 3. Scoped A cannot update B's product.
    const upd = await a.product.updateMany({
      where: { id: prodB.id },
      data: { name: "hacked" },
    });
    if (upd.count !== 0) {
      fail(`A.updateMany affected ${upd.count} of B's rows, expected 0`);
    }
    const bAfterUpdate = await b.product.findFirst({ where: { id: prodB.id } });
    if (!bAfterUpdate || bAfterUpdate.name !== "Iso Tee B") {
      fail("B's product name was changed by A's update attempt");
    }

    // 4. Scoped A cannot delete B's product.
    const del = await a.product.deleteMany({ where: { id: prodB.id } });
    if (del.count !== 0) {
      fail(`A.deleteMany removed ${del.count} of B's rows, expected 0`);
    }
    const bStillExists = await b.product.findFirst({ where: { id: prodB.id } });
    if (!bStillExists) {
      fail("B's product was deleted by A's delete attempt");
    }

    // 5. Scoped A count excludes B's rows.
    const aCount = await a.product.count();
    if (aCount !== 1) {
      fail(`A.count returned ${aCount}, expected 1 (must exclude B)`);
    }

    // 6. Both tenants hold slug "iso-test-tee" simultaneously (verified above
    //    by both creates succeeding; double-check via raw client).
    const slugRows = await prisma.product.findMany({ where: { slug: SLUG } });
    const slugTenants = new Set(slugRows.map((r) => r.tenantId));
    if (!slugTenants.has(TENANT_A) || !slugTenants.has(TENANT_B)) {
      fail("slug 'iso-test-tee' is not held by both tenants");
    }

    console.log("ISOLATION_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

/** Delete every row owned by the two test tenants, children first. */
async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  const ids = [TENANT_A, TENANT_B];
  try {
    await prisma.customer.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.category.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  } catch (err) {
    // During pre-clean the rows may not exist yet — that's fine.
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("ISOLATION_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
