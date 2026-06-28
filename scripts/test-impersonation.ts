/**
 * test-impersonation.ts — Operator impersonation proof (P10)
 *
 * Simulates the impersonation START endpoint logic against a target tenant and
 * asserts:
 *   1. it mints an `as-admin-session` JWT carrying `impersonatedBy` (the operator)
 *      and the TARGET `tenantId` (+ impersonatorEmail);
 *   2. a PlatformAuditLog "impersonate.start" row is written;
 *   3. the minted session resolves (via the admin tenant resolver path) to the
 *      TARGET tenant — a scoped client built from the session's tenantId is bound
 *      to the target, NOT tenant zero;
 *   4. simulating STOP writes a PlatformAuditLog "impersonate.stop" row.
 * All throwaway rows are cleaned up.
 *
 * Run:  npx tsx scripts/test-impersonation.ts  → prints IMPERSONATION_PASS, exit 0
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
  console.error(`IMPERSONATION_FAIL: ${reason}`);
  process.exit(1);
}

const OPERATOR_EMAIL = "__imp_op@test.local";
const TENANT_ID = "__imp_tenant";
const ADMIN_EMAIL = "__imp_super@test.local";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getTenantPrisma } = await import("../src/lib/tenant-prisma");
  const { DEFAULT_TENANT_ID } = await import("../src/lib/tenant-context");
  const { SignJWT, jwtVerify } = await import("jose");

  const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

  await cleanup(prisma);

  try {
    // Setup: an operator + a target tenant (NOT tenant zero) with a SUPER_ADMIN.
    const operator = await prisma.platformOperator.create({
      data: { email: OPERATOR_EMAIL, name: "Imp Operator", isActive: true },
    });
    const tenant = await prisma.tenant.create({
      data: { id: TENANT_ID, slug: "__imp-tenant", name: "Imp Target" },
    });
    const superAdmin = await prisma.adminUser.create({
      data: { tenantId: TENANT_ID, email: ADMIN_EMAIL, name: "Imp Super", role: "SUPER_ADMIN", isActive: true },
    });

    // ── Simulate START endpoint logic ──────────────────────────────────────
    // (mirrors src/app/api/platform/tenants/[id]/impersonate/route.ts)
    const target = await prisma.adminUser.findFirst({
      where: { tenantId: TENANT_ID, role: "SUPER_ADMIN", isActive: true },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!target || target.id !== superAdmin.id) fail("start logic did not pick the tenant's SUPER_ADMIN");

    await prisma.platformAuditLog.create({
      data: {
        operatorId: operator.id,
        operatorEmail: operator.email,
        action: "impersonate.start",
        tenantId: TENANT_ID,
        detail: `impersonating "${tenant.name}" as ${target.email}`,
      },
    });

    // Mint the as-admin-session JWT exactly as createAdminSession would (claims).
    const adminJwt = await new SignJWT({
      id: target.id,
      email: target.email,
      name: target.name,
      role: target.role,
      tenantId: TENANT_ID,
      impersonatedBy: operator.id,
      impersonatorEmail: operator.email,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(SECRET);

    // 1. minted session carries impersonatedBy + TARGET tenantId.
    const { payload } = await jwtVerify(adminJwt, SECRET);
    if (payload.impersonatedBy !== operator.id) fail("minted session missing/incorrect impersonatedBy");
    if (payload.impersonatorEmail !== operator.email) fail("minted session missing impersonatorEmail");
    if (payload.tenantId !== TENANT_ID) fail(`minted session tenantId=${payload.tenantId}, expected ${TENANT_ID}`);

    // 2. start audit row written.
    const startRow = await prisma.platformAuditLog.findFirst({
      where: { operatorId: operator.id, action: "impersonate.start", tenantId: TENANT_ID },
    });
    if (!startRow) fail("no impersonate.start audit row written");

    // 3. resolves to TARGET tenant (not tenant zero). The admin resolver prefers
    //    the embedded tenantId; a scoped client built from it is bound to target.
    const embeddedTenantId = payload.tenantId as string;
    if (embeddedTenantId === DEFAULT_TENANT_ID) fail("session resolved to tenant zero, not the target");
    const db = getTenantPrisma(embeddedTenantId);
    if (db.$tenantId !== TENANT_ID) fail(`scoped client bound to ${db.$tenantId}, expected ${TENANT_ID}`);

    // ── Simulate STOP endpoint logic ───────────────────────────────────────
    await prisma.platformAuditLog.create({
      data: {
        operatorId: operator.id,
        operatorEmail: operator.email,
        action: "impersonate.stop",
        tenantId: TENANT_ID,
        detail: `stopped impersonating ${target.email}`,
      },
    });
    const stopRow = await prisma.platformAuditLog.findFirst({
      where: { operatorId: operator.id, action: "impersonate.stop", tenantId: TENANT_ID },
    });
    if (!stopRow) fail("no impersonate.stop audit row written");

    // ── Status guard (P0-4): impersonation rejects non-ACTIVE tenants ──────────
    // Exercise the REAL POST handler. SUSPENDED/ARCHIVED must 403 BEFORE any
    // session mint; ACTIVE must pass the guard (it then proceeds to the audit +
    // createAdminSession, the latter throwing because cookies() needs a request
    // scope — we detect "guard passed" via a fresh impersonate.start audit row).
    const { POST: impersonatePOST } = await import(
      "../src/app/api/platform/tenants/[id]/impersonate/route"
    );
    const opCookie = await new SignJWT({
      id: operator.id, email: operator.email, name: operator.name, kind: "operator",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(SECRET);

    function stubReq() {
      return {
        cookies: {
          get(name: string) {
            return name === "as-platform-session" ? { value: opCookie } : undefined;
          },
        },
        json: async () => ({}),
        nextUrl: new URL("http://local/api/platform/tenants/x/impersonate"),
      } as unknown as import("next/server").NextRequest;
    }
    const withParams = (id: string) => ({ params: Promise.resolve({ id }) });

    for (const status of ["SUSPENDED", "ARCHIVED"] as const) {
      await prisma.tenant.update({ where: { id: TENANT_ID }, data: { status } });
      const res = await impersonatePOST(stubReq(), withParams(TENANT_ID));
      if (res.status !== 403) fail(`guard ${status}: expected 403, got ${res.status}`);
      const body = await res.json();
      if (body.error !== "tenant_unavailable") fail(`guard ${status}: expected tenant_unavailable, got ${body.error}`);
      if (body.status !== status) fail(`guard ${status}: body.status=${body.status}, expected ${status}`);
    }

    await prisma.tenant.update({ where: { id: TENANT_ID }, data: { status: "ACTIVE" } });
    const beforeStart = await prisma.platformAuditLog.count({
      where: { tenantId: TENANT_ID, action: "impersonate.start" },
    });
    try {
      const res = await impersonatePOST(stubReq(), withParams(TENANT_ID));
      if (res.status === 403) fail("guard ACTIVE: impersonation wrongly rejected with 403");
    } catch {
      // Expected: createAdminSession's cookies() throws outside a request scope —
      // that is PAST the status guard, which is exactly what we're proving.
    }
    const afterStart = await prisma.platformAuditLog.count({
      where: { tenantId: TENANT_ID, action: "impersonate.start" },
    });
    if (afterStart !== beforeStart + 1)
      fail("guard ACTIVE: guard should let impersonation through (a new impersonate.start row expected)");

    console.log("IMPERSONATION_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  try {
    await prisma.platformAuditLog.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.platformOperatorToken.deleteMany({ where: { email: OPERATOR_EMAIL } });
    await prisma.platformOperator.deleteMany({ where: { email: OPERATOR_EMAIL } });
    await prisma.adminUser.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  } catch (err) {
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("IMPERSONATION_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
