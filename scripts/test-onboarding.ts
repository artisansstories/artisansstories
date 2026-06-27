/**
 * test-onboarding.ts — Platform onboarding E2E (P6)
 *
 * Drives the real `/api/platform/**` route handlers with a constructed
 * NextRequest carrying a platform-admin session cookie (minted here with the
 * same JWT secret/format as src/lib/admin-auth.ts). End-to-end flow:
 *
 *   1. create tenant            POST /api/platform/tenants            → 201
 *   2. tenant detail            GET  /api/platform/tenants/[id]       → 200
 *   3. mint API key             POST /api/platform/tenants/[id]/api-keys → 201 (raw token once)
 *   4. use key on storefront    GET  /api/v1/store/theme (Bearer)     → 200
 *   5. revoke key               DELETE .../api-keys/[keyId]           → 200
 *   6. key now rejected         GET  /api/v1/store/theme (Bearer)     → 401
 *
 * Plus guardrails: no-session platform call → 401, unknown scope → 400.
 *
 * Run:  npx tsx scripts/test-onboarding.ts   → prints ONBOARDING_PASS, exit 0
 */
import * as path from "path";
import * as fs from "fs";

// Load env BEFORE importing anything that reads DATABASE_URL / NEXTAUTH_SECRET.
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

const TENANT_ZERO = "tenant_artisans_stories";
const COOKIE_NAME = "as-admin-session";

function fail(reason: string): never {
  console.log(`ONBOARDING_FAIL: ${reason}`);
  process.exit(1);
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { NextRequest } = await import("next/server");
  const { SignJWT } = await import("jose");

  // Platform route handlers under test.
  const tenantsRoute = await import("../src/app/api/platform/tenants/route");
  const tenantDetailRoute = await import("../src/app/api/platform/tenants/[id]/route");
  const apiKeysRoute = await import("../src/app/api/platform/tenants/[id]/api-keys/route");
  const apiKeyItemRoute = await import("../src/app/api/platform/tenants/[id]/api-keys/[keyId]/route");
  const v1ThemeRoute = await import("../src/app/api/v1/store/theme/route");

  const base = "http://localhost";
  let createdTenantId: string | null = null;
  let createdKeyId: string | null = null;

  try {
    // ── Ensure tenant zero exists & is the platform owner ────────────────────
    await prisma.tenant.upsert({
      where: { id: TENANT_ZERO },
      update: { isPlatformOwner: true },
      create: { id: TENANT_ZERO, slug: "artisans-stories", name: "Artisans Stories", isPlatformOwner: true },
    });

    // ── Mint a platform-admin session cookie (same secret/format as admin-auth) ─
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);
    const jwt = await new SignJWT({
      id: "onboarding-test-admin",
      email: "platform@artisansstories.com",
      name: "Platform Operator",
      role: "OWNER",
      tenantId: TENANT_ZERO,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);

    const adminCookie = (extra?: Record<string, string>) => ({
      cookie: `${COOKIE_NAME}=${jwt}`,
      ...(extra ?? {}),
    });

    // ── Guardrail: platform route with NO session → 401 ──────────────────────
    {
      const res = await tenantsRoute.GET(new NextRequest(`${base}/api/platform/tenants`));
      if (res.status !== 401) fail(`no-session list status ${res.status}, expected 401`);
    }

    // ── 1. Create a tenant ───────────────────────────────────────────────────
    const slug = `p6-onboard-${Date.now().toString(36)}`;
    {
      const res = await tenantsRoute.POST(
        new NextRequest(`${base}/api/platform/tenants`, {
          method: "POST",
          headers: adminCookie({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: "P6 Onboarding Co", slug, platformFeeBps: 500 }),
        }),
      );
      if (res.status !== 201) fail(`create tenant status ${res.status}, expected 201`);
      const body = await res.json();
      if (!body.id || body.slug !== slug) fail("create tenant returned unexpected body");
      if (body.platformFeeBps !== 500) fail("create tenant did not honor platformFeeBps");
      createdTenantId = body.id;
    }

    // Default theme + store settings must have been created.
    {
      const themeRow = await prisma.tenantTheme.findUnique({ where: { tenantId: createdTenantId! } });
      if (!themeRow) fail("default TenantTheme was not created");
      const settings = await prisma.storeSettings.findFirst({ where: { tenantId: createdTenantId! } });
      if (!settings) fail("default StoreSettings was not created");
    }

    // ── Guardrail: duplicate slug → 409 ──────────────────────────────────────
    {
      const res = await tenantsRoute.POST(
        new NextRequest(`${base}/api/platform/tenants`, {
          method: "POST",
          headers: adminCookie({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: "Dup", slug }),
        }),
      );
      if (res.status !== 409) fail(`duplicate slug status ${res.status}, expected 409`);
    }

    // ── 2. Tenant detail ─────────────────────────────────────────────────────
    {
      const res = await tenantDetailRoute.GET(
        new NextRequest(`${base}/api/platform/tenants/${createdTenantId}`, { headers: adminCookie() }),
        { params: Promise.resolve({ id: createdTenantId! }) },
      );
      if (res.status !== 200) fail(`tenant detail status ${res.status}, expected 200`);
      const body = await res.json();
      if (body.id !== createdTenantId) fail("tenant detail id mismatch");
      if (!body.theme) fail("tenant detail missing theme");
      if (typeof body.productCount !== "number") fail("tenant detail missing productCount");
      if (typeof body.apiKeyCount !== "number") fail("tenant detail missing apiKeyCount");
    }

    // ── Guardrail: mint with unknown scope → 400 ─────────────────────────────
    {
      const res = await apiKeysRoute.POST(
        new NextRequest(`${base}/api/platform/tenants/${createdTenantId}/api-keys`, {
          method: "POST",
          headers: adminCookie({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: "bad", scopes: ["store:read", "admin:everything"] }),
        }),
        { params: Promise.resolve({ id: createdTenantId! }) },
      );
      if (res.status !== 400) fail(`unknown-scope mint status ${res.status}, expected 400`);
    }

    // ── 3. Mint an API key (default scopes) ──────────────────────────────────
    let rawToken = "";
    {
      const res = await apiKeysRoute.POST(
        new NextRequest(`${base}/api/platform/tenants/${createdTenantId}/api-keys`, {
          method: "POST",
          headers: adminCookie({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: "Storefront key" }),
        }),
        { params: Promise.resolve({ id: createdTenantId! }) },
      );
      if (res.status !== 201) fail(`mint key status ${res.status}, expected 201`);
      const body = await res.json();
      if (!body.token || !body.token.startsWith("oss_")) fail("mint did not return a raw token");
      if (!Array.isArray(body.scopes) || !body.scopes.includes("store:read")) {
        fail("minted key missing default store:read scope");
      }
      if (!body.warning) fail("mint response missing one-time warning");
      createdKeyId = body.id;
      rawToken = body.token;
    }

    // List must show the key by prefix, never the raw token or hash.
    {
      const res = await apiKeysRoute.GET(
        new NextRequest(`${base}/api/platform/tenants/${createdTenantId}/api-keys`, { headers: adminCookie() }),
        { params: Promise.resolve({ id: createdTenantId! }) },
      );
      if (res.status !== 200) fail(`list keys status ${res.status}, expected 200`);
      const body = await res.json();
      const k = body.keys?.find((x: { id: string }) => x.id === createdKeyId);
      if (!k) fail("minted key not present in list");
      if ("token" in k || "keyHash" in k) fail("list keys leaked token/hash");
    }

    // ── 4. Use the key against the v1 storefront → 200 ───────────────────────
    {
      const res = await v1ThemeRoute.GET(
        new NextRequest(`${base}/api/v1/store/theme`, { headers: { Authorization: `Bearer ${rawToken}` } }),
      );
      if (res.status !== 200) fail(`storefront theme with live key status ${res.status}, expected 200`);
      const body = await res.json();
      if (!body.theme) fail("storefront theme response missing theme");
    }

    // ── 5. Revoke the key ────────────────────────────────────────────────────
    {
      const res = await apiKeyItemRoute.DELETE(
        new NextRequest(`${base}/api/platform/tenants/${createdTenantId}/api-keys/${createdKeyId}`, {
          method: "DELETE",
          headers: adminCookie(),
        }),
        { params: Promise.resolve({ id: createdTenantId!, keyId: createdKeyId! }) },
      );
      if (res.status !== 200) fail(`revoke key status ${res.status}, expected 200`);
      const body = await res.json();
      if (body.revoked !== true) fail("revoke did not report revoked:true");
    }

    // ── 6. Revoked key is now rejected by the v1 resolver → 401 ──────────────
    {
      const res = await v1ThemeRoute.GET(
        new NextRequest(`${base}/api/v1/store/theme`, { headers: { Authorization: `Bearer ${rawToken}` } }),
      );
      if (res.status !== 401) fail(`storefront theme with revoked key status ${res.status}, expected 401`);
    }

    console.log("ONBOARDING_PASS");
  } finally {
    // Cleanup: remove the created tenant and everything keyed to it.
    try {
      if (createdTenantId) {
        await prisma.tenantApiKey.deleteMany({ where: { tenantId: createdTenantId } });
        await prisma.tenantTheme.deleteMany({ where: { tenantId: createdTenantId } });
        await prisma.storeSettings.deleteMany({ where: { tenantId: createdTenantId } });
        await prisma.tenant.deleteMany({ where: { id: createdTenantId } });
      }
    } catch (err) {
      console.error("cleanup warning:", err);
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.log(`ONBOARDING_FAIL: ${err?.message ?? "unexpected error"}`);
  console.error(err);
  process.exit(1);
});
