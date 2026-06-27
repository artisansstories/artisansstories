/**
 * test-admin-scoping.ts — Store-admin scoping regression wall (P8)
 *
 * Proves the formerly-leaky slug/listing paths are now tenant-scoped. Stands up
 * two throwaway tenants, each with a Product and a Category that share a
 * COLLIDING slug across tenants, then asserts through the SCOPED client that:
 *
 *   - tenant A's scoped client lists ONLY A's products/categories — never B's,
 *     even with the colliding slug present.
 *   - the slug-uniqueness check (the formerly-leaky `findFirst({where:{slug}})`)
 *     now sees ONLY the same-tenant row, so A can "create" a product whose slug
 *     already exists in B (per-tenant uniqueness) without ever seeing B's row.
 *
 * Run:  npx tsx scripts/test-admin-scoping.ts   → prints ADMIN_SCOPING_PASS, exit 0
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
  console.error(`ADMIN_SCOPING_FAIL: ${reason}`);
  process.exit(1);
}

/**
 * Cast helper: the scoped extension injects `tenantId` at runtime, but the
 * client TYPES still demand it. We OMIT `tenantId` from create payloads to PROVE
 * the hook adds it, so the data must be cast to claim `tenantId` is present.
 */
function omitTenant<T>(data: T): T & { tenantId: string } {
  return data as T & { tenantId: string };
}

const TENANT_A = "__scope_a";
const TENANT_B = "__scope_b";
// Unique random suffix so reruns never collide with stragglers; cleanup also
// removes everything owned by the two test tenants regardless of suffix.
const RAND = Math.random().toString(36).slice(2, 10);
const PRODUCT_SLUG = `test-collide-${RAND}`;
const CATEGORY_SLUG = `cat-collide-${RAND}`;

async function main() {
  // Dynamic imports so the env loader above runs first.
  const { prisma } = await import("../src/lib/prisma");
  const { getTenantPrisma } = await import("../src/lib/tenant-prisma");

  // Best-effort pre-clean in case a prior run died mid-flight.
  await cleanup(prisma);

  try {
    // ── Setup: two tenants via the RAW client ──────────────────────────────
    await prisma.tenant.create({
      data: { id: TENANT_A, slug: "__scope-test-a", name: "Scope Test A" },
    });
    await prisma.tenant.create({
      data: { id: TENANT_B, slug: "__scope-test-b", name: "Scope Test B" },
    });

    const a = getTenantPrisma(TENANT_A);
    const b = getTenantPrisma(TENANT_B);

    // ── Each tenant gets a Category and a Product sharing the SAME slug, via
    //    its SCOPED client. tenantId is auto-injected by the scoped hook. ────
    await a.category.create({ data: omitTenant({ slug: CATEGORY_SLUG, name: "Cat A" }) });
    await b.category.create({ data: omitTenant({ slug: CATEGORY_SLUG, name: "Cat B" }) });

    const prodA = await a.product.create({
      data: omitTenant({ slug: PRODUCT_SLUG, name: "Collide Tee A", price: 1000 }),
    });
    const prodB = await b.product.create({
      data: omitTenant({ slug: PRODUCT_SLUG, name: "Collide Tee B", price: 2000 }),
    });

    if (!prodA?.id || !prodB?.id) {
      fail("both tenants could not create a product with the colliding slug");
    }

    // ── 1. store-admin-sees-only-own: A's scoped client lists only A's rows ──
    const aProducts = await a.product.findMany();
    if (aProducts.length !== 1) {
      fail(`A.product.findMany returned ${aProducts.length} products, expected 1`);
    }
    if (aProducts[0].id !== prodA.id) {
      fail("A.product.findMany returned a product that is not A's");
    }
    if (aProducts.some((p) => p.id === prodB.id)) {
      fail("A.product.findMany leaked B's product (colliding slug)");
    }

    const aCategories = await a.category.findMany();
    if (aCategories.length !== 1) {
      fail(`A.category.findMany returned ${aCategories.length} categories, expected 1`);
    }
    if (aCategories.some((c) => c.name === "Cat B")) {
      fail("A.category.findMany leaked B's category (colliding slug)");
    }

    // ── 2. slug-uniqueness check (the formerly-leaky path) is scoped ─────────
    // A's scoped findFirst({where:{slug}}) must see ONLY A's row for the
    // colliding product slug — never B's. This is exactly what makeUniqueSlug
    // runs; before the fix it used the GLOBAL client and saw B's row too.
    const aSlugHit = await a.product.findFirst({ where: { slug: PRODUCT_SLUG } });
    if (!aSlugHit) {
      fail("A's scoped slug check found nothing for its own product slug");
    }
    if (aSlugHit.id !== prodA.id) {
      fail("A's scoped slug check returned a row that is not A's (cross-tenant leak)");
    }

    // Same for categories.
    const aCatSlugHit = await a.category.findFirst({ where: { slug: CATEGORY_SLUG } });
    if (!aCatSlugHit || aCatSlugHit.name !== "Cat A") {
      fail("A's scoped category slug check leaked B's category or missed A's");
    }

    // ── 3. cross-write blocked / per-tenant uniqueness: A creates ANOTHER
    //    product whose slug already exists in B. The scoped uniqueness check
    //    must NOT see B's row, so the base slug is free for A. We mimic the
    //    makeUniqueSlug loop against A's scoped client for a slug only B holds. ─
    const bOnlySlug = `test-bonly-${RAND}`;
    await b.product.create({
      data: omitTenant({ slug: bOnlySlug, name: "B Only", price: 500 }),
    });
    // A's scoped check for B's exclusive slug must return null (not visible).
    const aSeesBOnly = await a.product.findFirst({ where: { slug: bOnlySlug } });
    if (aSeesBOnly !== null) {
      fail("A's scoped slug check saw B's exclusive product (cross-tenant leak)");
    }
    // Therefore A can create a product using that exact slug — independently.
    const created = await a.product.create({
      data: omitTenant({ slug: bOnlySlug, name: "A reuses B slug", price: 700 }),
    });
    if (created.tenantId !== TENANT_A) {
      fail(`A's new product was stamped tenantId=${created.tenantId}, expected ${TENANT_A}`);
    }
    // And B's original row for that slug is untouched / still B's.
    const bOriginal = await b.product.findFirst({ where: { slug: bOnlySlug } });
    if (!bOriginal || bOriginal.tenantId !== TENANT_B || bOriginal.name !== "B Only") {
      fail("B's exclusive-slug product was mutated or lost by A's create");
    }

    console.log("ADMIN_SCOPING_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

/** Delete every row owned by the two test tenants, children first. */
async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  const ids = [TENANT_A, TENANT_B];
  try {
    await prisma.product.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.category.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  } catch (err) {
    // During pre-clean the rows may not exist yet — that's fine.
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("ADMIN_SCOPING_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
