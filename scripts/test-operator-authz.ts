/**
 * test-operator-authz.ts — Operator-vs-store-admin authorization wall (P10)
 *
 * Proves the P10 cutover: `/api/platform/**` is operator-only, and a store admin
 * (Anna) can no longer operate the platform. Drives the REAL tenants-list route
 * handler (src/app/api/platform/tenants/route.ts GET) with request stubs:
 *
 *   (a) operator `as-platform-session` cookie → 200, and the list contains a
 *       freshly-created tenant (operator can see all tenants).
 *   (b) valid store-admin `as-admin-session` cookie (NO operator cookie) → 401:
 *       the operator gate rejects it. This is the "Anna can't operate" proof.
 *   (c) no cookie at all → 401.
 *
 * Run:  npx tsx scripts/test-operator-authz.ts  → prints OPERATOR_AUTHZ_PASS, exit 0
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
  console.error(`OPERATOR_AUTHZ_FAIL: ${reason}`);
  process.exit(1);
}

const OPERATOR_EMAIL = "__authz_op@test.local";
const TENANT_ID = "__authz_tenant";
const ADMIN_EMAIL = "__authz_anna@test.local";

/** A NextRequest-ish stub exposing just the cookie jar the gate reads. */
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
  const { GET: tenantsGET } = await import("../src/app/api/platform/tenants/route");
  const { SignJWT } = await import("jose");

  const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

  async function mintOperatorCookie(claims: { id: string; email: string; name: string }) {
    return new SignJWT({ ...claims, kind: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(SECRET);
  }
  async function mintAdminCookie(claims: { id: string; email: string; name: string; role: string; tenantId: string }) {
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(SECRET);
  }

  await cleanup(prisma);

  try {
    // Setup: an active operator, plus a throwaway tenant + store admin (Anna).
    const operator = await prisma.platformOperator.create({
      data: { email: OPERATOR_EMAIL, name: "Authz Operator", isActive: true },
    });
    await prisma.tenant.create({
      data: { id: TENANT_ID, slug: "__authz-tenant", name: "Authz Tenant" },
    });
    const anna = await prisma.adminUser.create({
      data: { tenantId: TENANT_ID, email: ADMIN_EMAIL, name: "Anna Authz", role: "SUPER_ADMIN", isActive: true },
    });

    // ── (a) operator cookie → 200 + tenant visible ─────────────────────────
    const opCookie = await mintOperatorCookie({ id: operator.id, email: operator.email, name: operator.name });
    const aRes = await tenantsGET(stubRequest({ "as-platform-session": opCookie }));
    if (aRes.status !== 200) fail(`(a) operator GET expected 200, got ${aRes.status}`);
    const aBody = await aRes.json();
    if (!Array.isArray(aBody.tenants)) fail("(a) operator GET did not return a tenants array");
    if (!aBody.tenants.some((t: { id: string }) => t.id === TENANT_ID)) {
      fail("(a) operator GET did not include the freshly-created tenant (can't see all)");
    }

    // ── (b) store-admin cookie (no operator cookie) → 401 ──────────────────
    const adminCookie = await mintAdminCookie({
      id: anna.id, email: anna.email, name: anna.name, role: anna.role, tenantId: TENANT_ID,
    });
    const bRes = await tenantsGET(stubRequest({ "as-admin-session": adminCookie }));
    if (bRes.status !== 401) {
      fail(`(b) store-admin cookie expected 401 from operator gate, got ${bRes.status} — Anna can still operate the platform!`);
    }

    // ── (c) no cookie → 401 ────────────────────────────────────────────────
    const cRes = await tenantsGET(stubRequest({}));
    if (cRes.status !== 401) fail(`(c) no-cookie expected 401, got ${cRes.status}`);

    console.log("OPERATOR_AUTHZ_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  try {
    await prisma.platformOperatorToken.deleteMany({ where: { email: OPERATOR_EMAIL } });
    await prisma.platformOperator.deleteMany({ where: { email: OPERATOR_EMAIL } });
    await prisma.adminUser.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  } catch (err) {
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("OPERATOR_AUTHZ_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
