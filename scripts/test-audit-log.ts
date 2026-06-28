/**
 * test-audit-log.ts — Audit-log viewer endpoint (Phase A7 / P2-5)
 *
 * Proves GET /api/platform/audit-log surfaces PlatformAuditLog correctly against
 * the REAL route handler, mirroring scripts/test-tenant-lifecycle.ts:
 *
 *   • Unauthenticated (no operator cookie) → 401 (operator-gated).
 *   • Authenticated → 200; returns seeded rows newest-first; resolves the target
 *     tenant's name/slug for rows whose tenant still exists.
 *   • ?tenantId= filters to one tenant's rows only.
 *   • ?action= filters to one action only.
 *   • ?limit= caps the row count.
 *
 * Run:  npx tsx scripts/test-audit-log.ts  → prints AUDIT_LOG_PASS, exit 0
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
  console.error(`AUDIT_LOG_FAIL: ${reason}`);
  process.exit(1);
}

function assert(cond: unknown, reason: string): asserts cond {
  if (!cond) fail(reason);
}

const OPERATOR_EMAIL = "__audit_op@test.local";
const TENANT_A = "__audit_tenant_a";
const TENANT_A_SLUG = "__audit-tenant-a";
const TENANT_B = "__audit_tenant_b";
const TENANT_B_SLUG = "__audit-tenant-b";

function stubRequest(cookies: Record<string, string>, url?: string) {
  return {
    cookies: {
      get(name: string) {
        return name in cookies ? { value: cookies[name] } : undefined;
      },
    },
    nextUrl: url ? new URL(url) : undefined,
  } as unknown as import("next/server").NextRequest;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { GET: auditGET } = await import("../src/app/api/platform/audit-log/route");
  const { SignJWT } = await import("jose");

  const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

  async function mintOperatorCookie(claims: { id: string; email: string; name: string }) {
    return new SignJWT({ ...claims, kind: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(SECRET);
  }

  await cleanup(prisma);

  try {
    const operator = await prisma.platformOperator.create({
      data: { email: OPERATOR_EMAIL, name: "Audit Operator", isActive: true },
    });
    const cookie = await mintOperatorCookie({
      id: operator.id,
      email: operator.email,
      name: operator.name,
    });
    const auth = { "as-platform-session": cookie };

    // Two tenants so the tenantId filter has something to discriminate against.
    await prisma.tenant.create({ data: { id: TENANT_A, slug: TENANT_A_SLUG, name: "Audit Tenant A", status: "ACTIVE" } });
    await prisma.tenant.create({ data: { id: TENANT_B, slug: TENANT_B_SLUG, name: "Audit Tenant B", status: "ACTIVE" } });

    // Seed audit rows: 2 on A (archive + reactivate), 1 on B (impersonate). The
    // explicit createdAt ordering lets us assert newest-first deterministically.
    await prisma.platformAuditLog.create({
      data: { operatorId: operator.id, operatorEmail: operator.email, action: "tenant.archive", tenantId: TENANT_A, detail: "archived A", createdAt: new Date(Date.now() - 30_000) },
    });
    await prisma.platformAuditLog.create({
      data: { operatorId: operator.id, operatorEmail: operator.email, action: "impersonate.start", tenantId: TENANT_B, detail: "impersonating B", createdAt: new Date(Date.now() - 20_000) },
    });
    await prisma.platformAuditLog.create({
      data: { operatorId: operator.id, operatorEmail: operator.email, action: "tenant.reactivate", tenantId: TENANT_A, detail: "reactivated A", createdAt: new Date(Date.now() - 10_000) },
    });

    // ── 1. Operator gate: no cookie → 401 ────────────────────────────────────
    const unauth = await auditGET(stubRequest({}));
    assert(unauth.status === 401, `1: unauthenticated expected 401, got ${unauth.status}`);

    // ── 2. Authenticated → 200, rows newest-first, tenant label resolved ──────
    const allRes = await auditGET(stubRequest(auth, "http://local/api/platform/audit-log"));
    assert(allRes.status === 200, `2: authenticated expected 200, got ${allRes.status}`);
    const allBody = await allRes.json();
    const ours = allBody.entries.filter(
      (e: { tenantId: string | null }) => e.tenantId === TENANT_A || e.tenantId === TENANT_B,
    );
    assert(ours.length === 3, `2: expected our 3 seeded rows, got ${ours.length}`);
    // Newest-first: reactivate (newest) before impersonate before archive (oldest).
    const idx = (action: string) => ours.findIndex((e: { action: string }) => e.action === action);
    assert(
      idx("tenant.reactivate") < idx("impersonate.start") && idx("impersonate.start") < idx("tenant.archive"),
      "2: rows must be newest-first",
    );
    const aRow = ours.find((e: { action: string }) => e.action === "tenant.archive");
    assert(aRow.tenantName === "Audit Tenant A" && aRow.tenantSlug === TENANT_A_SLUG, "2: tenant label must resolve to A's name/slug");

    // ── 3. ?tenantId= filter ─────────────────────────────────────────────────
    const aOnlyRes = await auditGET(stubRequest(auth, `http://local/api/platform/audit-log?tenantId=${TENANT_A}`));
    const aOnly = await aOnlyRes.json();
    assert(
      aOnly.entries.length === 2 && aOnly.entries.every((e: { tenantId: string }) => e.tenantId === TENANT_A),
      `3: tenantId filter must return only A's 2 rows, got ${aOnly.entries.length}`,
    );

    // ── 4. ?action= filter ───────────────────────────────────────────────────
    const actRes = await auditGET(stubRequest(auth, "http://local/api/platform/audit-log?action=impersonate.start"));
    const actBody = await actRes.json();
    const actOurs = actBody.entries.filter(
      (e: { tenantId: string | null }) => e.tenantId === TENANT_A || e.tenantId === TENANT_B,
    );
    assert(
      actOurs.length === 1 && actOurs[0].action === "impersonate.start" && actOurs[0].tenantId === TENANT_B,
      `4: action filter must return only the impersonate.start row, got ${actOurs.length}`,
    );

    // ── 5. ?limit= cap ───────────────────────────────────────────────────────
    const limRes = await auditGET(stubRequest(auth, "http://local/api/platform/audit-log?limit=1"));
    const limBody = await limRes.json();
    assert(limBody.entries.length === 1, `5: limit=1 must return exactly 1 row, got ${limBody.entries.length}`);

    console.log("AUDIT_LOG_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  try {
    for (const tid of [TENANT_A, TENANT_B]) {
      await prisma.platformAuditLog.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await prisma.platformOperator.deleteMany({ where: { email: OPERATOR_EMAIL } });
  } catch (err) {
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("AUDIT_LOG_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
