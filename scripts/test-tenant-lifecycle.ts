/**
 * test-tenant-lifecycle.ts — Archive / reactivate + house-tenant guard (Phase A2)
 *
 * Proves the operator off-ramp (P0-1 tier 1, P1-1, P0-5) end-to-end against the
 * REAL route handlers, mirroring scripts/test-onboarding-train.ts:
 *
 *   • Archive tenant A (PATCH status=ARCHIVED) → 200; the storefront resolver
 *     (getStorefrontTenant) now returns null (the /t/{slug} 404 gate); every one
 *     of A's API keys has revokedAt set; A is hidden from the default tenants
 *     list but visible with ?includeArchived=1; a `tenant.archive` audit row exists.
 *   • Reactivate A (PATCH status=ACTIVE) → 200; the storefront resolves again; a
 *     `tenant.reactivate` audit row exists. (Keys stay revoked — re-mint, intended.)
 *   • Archiving an isPlatformOwner tenant → 403 platform_owner_protected.
 *   • Tenant B is untouched throughout (still ACTIVE, keys intact, still resolves).
 *
 * Run:  npx tsx scripts/test-tenant-lifecycle.ts  → prints TENANT_LIFECYCLE_PASS, exit 0
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
  console.error(`TENANT_LIFECYCLE_FAIL: ${reason}`);
  process.exit(1);
}

function assert(cond: unknown, reason: string): asserts cond {
  if (!cond) fail(reason);
}

const OPERATOR_EMAIL = "__lifecycle_op@test.local";
const TENANT_A = "__lifecycle_tenant_a";
const TENANT_A_SLUG = "__lifecycle-tenant-a";
const TENANT_B = "__lifecycle_tenant_b";
const TENANT_B_SLUG = "__lifecycle-tenant-b";
const TENANT_HOUSE = "__lifecycle_house";
const TENANT_HOUSE_SLUG = "__lifecycle-house";

/** Request stub: the cookie jar the operator gate reads, a json() body, and an
 * optional nextUrl so the list GET can read ?includeArchived. */
function stubRequest(cookies: Record<string, string>, body?: unknown, url?: string) {
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
    nextUrl: url ? new URL(url) : undefined,
  } as unknown as import("next/server").NextRequest;
}

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { GET: tenantsGET } = await import("../src/app/api/platform/tenants/route");
  const { PATCH: tenantPATCH } = await import("../src/app/api/platform/tenants/[id]/route");
  const { getStorefrontTenant } = await import("../src/lib/storefront");
  const { SignJWT } = await import("jose");

  const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

  async function mintOperatorCookie(claims: { id: string; email: string; name: string }) {
    return new SignJWT({ ...claims, kind: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(SECRET);
  }

  async function createTenant(
    id: string,
    slug: string,
    name: string,
    opts: { isPlatformOwner?: boolean } = {},
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({
        data: { id, slug, name, status: "ACTIVE", isPlatformOwner: opts.isPlatformOwner ?? false },
      });
      await tx.tenantTheme.create({ data: { tenantId: id } });
      await tx.storeSettings.create({ data: { tenantId: id, storeName: name, storeEnabled: true } });
    });
  }

  async function mintKeys(tenantId: string, n: number) {
    for (let i = 0; i < n; i++) {
      await prisma.tenantApiKey.create({
        data: {
          tenantId,
          name: `key-${i}`,
          keyHash: `${tenantId}-hash-${i}`,
          prefix: `pk_${i}`,
          scopes: ["store:read"],
        },
      });
    }
  }

  async function auditCount(tenantId: string, action: string) {
    return prisma.platformAuditLog.count({ where: { tenantId, action } });
  }

  await cleanup(prisma);

  try {
    const operator = await prisma.platformOperator.create({
      data: { email: OPERATOR_EMAIL, name: "Lifecycle Operator", isActive: true },
    });
    const cookie = await mintOperatorCookie({
      id: operator.id,
      email: operator.email,
      name: operator.name,
    });
    const auth = { "as-platform-session": cookie };

    await createTenant(TENANT_A, TENANT_A_SLUG, "Lifecycle Tenant A");
    await createTenant(TENANT_B, TENANT_B_SLUG, "Lifecycle Tenant B");
    await createTenant(TENANT_HOUSE, TENANT_HOUSE_SLUG, "Lifecycle House", { isPlatformOwner: true });
    await mintKeys(TENANT_A, 2);
    await mintKeys(TENANT_B, 1);

    // Sanity: A + B resolve before any change (ACTIVE storefronts).
    assert((await getStorefrontTenant(TENANT_A_SLUG)) !== null, "pre: A should resolve while ACTIVE");
    assert((await getStorefrontTenant(TENANT_B_SLUG)) !== null, "pre: B should resolve while ACTIVE");

    // ── 1. Archive A ─────────────────────────────────────────────────────────
    const arcRes = await tenantPATCH(
      stubRequest(auth, { status: "ARCHIVED" }),
      withParams(TENANT_A),
    );
    assert(arcRes.status === 200, `1: archive expected 200, got ${arcRes.status}`);

    // Storefront 404 gate: resolver returns null for ARCHIVED.
    assert((await getStorefrontTenant(TENANT_A_SLUG)) === null, "1: archived A must NOT resolve (404 gate)");

    // Every active key revoked.
    const aKeys = await prisma.tenantApiKey.findMany({ where: { tenantId: TENANT_A } });
    assert(aKeys.length === 2, `1: A should still have 2 key rows, got ${aKeys.length}`);
    assert(aKeys.every((k) => k.revokedAt !== null), "1: all of A's keys must be revoked on archive");

    // Hidden from default list, visible with ?includeArchived=1.
    const defRes = await tenantsGET(stubRequest(auth));
    const defBody = await defRes.json();
    assert(
      !defBody.tenants.some((t: { id: string }) => t.id === TENANT_A),
      "1: archived A must be HIDDEN from the default list",
    );
    const incRes = await tenantsGET(
      stubRequest(auth, undefined, "http://local/api/platform/tenants?includeArchived=1"),
    );
    const incBody = await incRes.json();
    assert(
      incBody.tenants.some((t: { id: string }) => t.id === TENANT_A),
      "1: archived A must be VISIBLE with ?includeArchived=1",
    );

    // Audit row.
    assert((await auditCount(TENANT_A, "tenant.archive")) === 1, "1: one tenant.archive audit row expected");

    // ── 2. Reactivate A ──────────────────────────────────────────────────────
    const reRes = await tenantPATCH(
      stubRequest(auth, { status: "ACTIVE" }),
      withParams(TENANT_A),
    );
    assert(reRes.status === 200, `2: reactivate expected 200, got ${reRes.status}`);
    assert((await getStorefrontTenant(TENANT_A_SLUG)) !== null, "2: reactivated A must resolve again");
    assert((await auditCount(TENANT_A, "tenant.reactivate")) === 1, "2: one tenant.reactivate audit row expected");

    // ── 3. House tenant cannot be archived → 403 platform_owner_protected ─────
    const houseRes = await tenantPATCH(
      stubRequest(auth, { status: "ARCHIVED" }),
      withParams(TENANT_HOUSE),
    );
    assert(houseRes.status === 403, `3: house archive expected 403, got ${houseRes.status}`);
    const houseBody = await houseRes.json();
    assert(
      houseBody.error === "platform_owner_protected",
      `3: error should be platform_owner_protected, got ${houseBody.error}`,
    );
    // And the house tenant is unchanged + still resolves.
    const house = await prisma.tenant.findUnique({ where: { id: TENANT_HOUSE }, select: { status: true } });
    assert(house?.status === "ACTIVE", `3: house status must stay ACTIVE, got ${house?.status}`);

    // ── 4. Tenant B untouched throughout ─────────────────────────────────────
    const b = await prisma.tenant.findUnique({ where: { id: TENANT_B }, select: { status: true } });
    assert(b?.status === "ACTIVE", `4: B status must stay ACTIVE, got ${b?.status}`);
    const bKeys = await prisma.tenantApiKey.findMany({ where: { tenantId: TENANT_B } });
    assert(bKeys.length === 1 && bKeys.every((k) => k.revokedAt === null), "4: B's key must remain active");
    assert((await getStorefrontTenant(TENANT_B_SLUG)) !== null, "4: B must still resolve");

    console.log("TENANT_LIFECYCLE_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  try {
    for (const tid of [TENANT_A, TENANT_B, TENANT_HOUSE]) {
      await prisma.storeSettings.deleteMany({ where: { tenantId: tid } });
      await prisma.platformAuditLog.deleteMany({ where: { tenantId: tid } });
      await prisma.tenantApiKey.deleteMany({ where: { tenantId: tid } });
      await prisma.tenantTheme.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await prisma.platformOperatorToken.deleteMany({ where: { email: OPERATOR_EMAIL } });
    await prisma.platformOperator.deleteMany({ where: { email: OPERATOR_EMAIL } });
  } catch (err) {
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("TENANT_LIFECYCLE_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
