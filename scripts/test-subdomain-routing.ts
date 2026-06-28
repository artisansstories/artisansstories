/**
 * test-subdomain-routing.ts — Acceptance gate for multi-tenant subdomain routing
 * + admin invite (T1–T5).
 *
 * Run:  npx tsx scripts/test-subdomain-routing.ts
 * (env auto-loads from .env.local / .env, like the other scripts.)
 *
 * Verifies:
 *   1. resolveTenantFromHost → DEFAULT_TENANT_ID for artisansstories.com
 *   2. resolveTenantFromHost → the right tenantId for
 *      galarraga-baseball.artisansstories.com (slug must exist in DB)
 *   3. resolveTenantFromHost throws for unknown-slug.artisansstories.com
 *   4. The platform admin-management endpoints (invite-admin, list, patch) exist
 *      and reject an UNAUTHENTICATED request with 401 — the operator gate runs
 *      first, so no invite email is sent and no AdminUser is touched.
 *   5. Prints SUBDOMAIN_ROUTING_PASS / SUBDOMAIN_ROUTING_FAIL.
 */
import * as fs from "fs";
import * as path from "path";

function loadEnv(f: string) {
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(path.resolve("./.env.local"));
loadEnv(path.resolve("./.env"));

const KNOWN_SLUG = "galarraga-baseball";

/** Minimal request stub exposing just the host header resolveTenantFromHost reads. */
function hostReq(host: string) {
  return { headers: { get: (n: string) => (n.toLowerCase() === "host" ? host : null) } };
}

/** NextRequest-ish stub with NO cookies — the operator gate finds no session → 401. */
function noAuthRequest(body: unknown = {}) {
  return {
    cookies: { get: () => undefined },
    json: async () => body,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name} — ${detail}`);
}

async function main() {
  const tc = await import("../src/lib/tenant-context");

  // 1. apex → tenant zero (no DB lookup, never throws).
  try {
    const root = await tc.resolveTenantFromHost(hostReq("artisansstories.com"));
    check("apex → DEFAULT_TENANT_ID", root === tc.DEFAULT_TENANT_ID, `got ${root}`);
  } catch (e) {
    check("apex → DEFAULT_TENANT_ID", false, `threw ${(e as Error).message}`);
  }

  // 2. known subdomain → its real tenantId (must differ from tenant zero).
  try {
    const sub = await tc.resolveTenantFromHost(hostReq(`${KNOWN_SLUG}.artisansstories.com`));
    check(
      `${KNOWN_SLUG} subdomain → tenantId`,
      typeof sub === "string" && sub.length > 0 && sub !== tc.DEFAULT_TENANT_ID,
      `got ${sub}`,
    );
  } catch (e) {
    check(
      `${KNOWN_SLUG} subdomain → tenantId`,
      false,
      `threw ${(e as Error).message} (does the slug exist in this DB?)`,
    );
  }

  // 3. unknown subdomain → throws TenantResolutionError.
  try {
    const bad = await tc.resolveTenantFromHost(hostReq("unknown-slug-xyz.artisansstories.com"));
    check("unknown subdomain throws", false, `did not throw; got ${bad}`);
  } catch (e) {
    check("unknown subdomain throws", e instanceof tc.TenantResolutionError, `threw ${(e as Error).name}`);
  }

  // 4. invite/list/patch endpoints exist and are operator-gated (401, no auth).
  const { POST: invitePOST } = await import("../src/app/api/platform/tenants/[id]/invite-admin/route");
  const { GET: adminsGET } = await import("../src/app/api/platform/tenants/[id]/admins/route");
  const { PATCH: adminPATCH } = await import("../src/app/api/platform/tenants/[id]/admins/[adminId]/route");

  try {
    const r = await invitePOST(noAuthRequest({ email: "x@test.local", name: "X" }), {
      params: Promise.resolve({ id: "t1" }),
    });
    check("invite-admin 401 without auth", r.status === 401, `status ${r.status}`);
  } catch (e) {
    check("invite-admin 401 without auth", false, `error: ${(e as Error).message}`);
  }

  try {
    const r = await adminsGET(noAuthRequest(), { params: Promise.resolve({ id: "t1" }) });
    check("admins-list 401 without auth", r.status === 401, `status ${r.status}`);
  } catch (e) {
    check("admins-list 401 without auth", false, `error: ${(e as Error).message}`);
  }

  try {
    const r = await adminPATCH(noAuthRequest({ isActive: false }), {
      params: Promise.resolve({ id: "t1", adminId: "a1" }),
    });
    check("admin-patch 401 without auth", r.status === 401, `status ${r.status}`);
  } catch (e) {
    check("admin-patch 401 without auth", false, `error: ${(e as Error).message}`);
  }

  const allOk = results.every((r) => r.ok);
  console.log("");
  console.log(allOk ? "SUBDOMAIN_ROUTING_PASS" : "SUBDOMAIN_ROUTING_FAIL");

  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  console.log("SUBDOMAIN_ROUTING_FAIL");
  process.exit(1);
});
