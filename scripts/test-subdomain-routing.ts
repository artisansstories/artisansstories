/**
 * test-subdomain-routing.ts — Auth-gate proof for the tenant admin-management
 * surface (T3 / T-gate).
 *
 * Drives the REAL platform route handlers with an UNAUTHENTICATED request stub
 * (no `as-platform-session` cookie) and asserts every one rejects with 401
 * BEFORE doing any work. These are pure negative tests — no operator session is
 * minted, so no invite email is ever sent and no AdminUser is touched:
 *
 *   1. GET   /api/platform/tenants/[id]/admins                  → 401
 *   2. POST  /api/platform/tenants/[id]/invite-admin            → 401
 *   3. PATCH /api/platform/tenants/[id]/admins/[adminId]        → 401
 *
 * The operator gate (requirePlatformOperator) runs first in each handler, so a
 * cookieless request short-circuits to 401 before any tenant/admin lookup — the
 * tenant id used here need not exist.
 *
 * Run:  npx tsx scripts/test-subdomain-routing.ts  → prints SUBDOMAIN_ROUTING_PASS, exit 0
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
  console.error(`SUBDOMAIN_ROUTING_FAIL: ${reason}`);
  process.exit(1);
}

/** A NextRequest-ish stub with NO cookies and an arbitrary JSON body. The gate
 * reads `req.cookies.get(...)`; an empty jar yields no operator token → 401. */
function noAuthRequest(body: unknown = {}) {
  return {
    cookies: {
      get(_name: string) {
        return undefined;
      },
    },
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { GET: adminsGET } = await import(
    "../src/app/api/platform/tenants/[id]/admins/route"
  );
  const { POST: invitePOST } = await import(
    "../src/app/api/platform/tenants/[id]/invite-admin/route"
  );
  const { PATCH: adminPATCH } = await import(
    "../src/app/api/platform/tenants/[id]/admins/[adminId]/route"
  );

  try {
    // Resolve the galarraga tenant id if it exists (per spec), else a placeholder
    // — irrelevant to the result since the 401 fires before any tenant lookup.
    const galarraga = await prisma.tenant
      .findUnique({ where: { slug: "galarraga-baseball" }, select: { id: true } })
      .catch(() => null);
    const tenantId = galarraga?.id ?? "galarraga-tenant-id";
    const adminId = "__nonexistent_admin_id";

    // 1. GET admins — no auth → 401
    const r1 = await adminsGET(noAuthRequest(), {
      params: Promise.resolve({ id: tenantId }),
    });
    if (r1.status !== 401) fail(`(1) GET admins expected 401, got ${r1.status}`);

    // 2. POST invite-admin — no auth → 401 (no email sent: gate runs first)
    const r2 = await invitePOST(
      noAuthRequest({ email: "nobody@test.local", name: "Nobody", role: "EDITOR" }),
      { params: Promise.resolve({ id: tenantId }) },
    );
    if (r2.status !== 401) fail(`(2) POST invite-admin expected 401, got ${r2.status}`);

    // 3. PATCH admins/[adminId] — no auth → 401
    const r3 = await adminPATCH(noAuthRequest({ isActive: false }), {
      params: Promise.resolve({ id: tenantId, adminId }),
    });
    if (r3.status !== 401) fail(`(3) PATCH admin expected 401, got ${r3.status}`);

    console.log("SUBDOMAIN_ROUTING_PASS");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("SUBDOMAIN_ROUTING_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
