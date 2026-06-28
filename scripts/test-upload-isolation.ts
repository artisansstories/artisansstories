/**
 * test-upload-isolation.ts — tenant-isolated upload key prefix gate (U2)
 *
 * Proves the isolation contract of POST /api/platform/tenants/[id]/upload:
 *   (a) operator-gated — no operator cookie → 401.
 *   (b) kind=logo for tenant A → 200, returned url/key under tenants/{A}/branding/.
 *   (c) same for tenant B → under tenants/{B}/branding/ (never A's id).
 *   (d) a body-supplied `tenantId` is IGNORED — POST to A's path with tenantId=B
 *       still returns a tenants/{A}/... prefix (the PATH wins).
 *   (e) the two tenants never share a key prefix.
 *
 * Drives the REAL route handler directly with a request stub carrying a minted
 * operator cookie + a multipart `formData()` — the same dual cookie-jar path that
 * scripts/test-operator-authz.ts / test-onboarding-train.ts use. No HTTP server.
 *
 * R2 creds are stripped from the environment below so the route takes its
 * "not configured → mock url" path: the test asserts the KEY/url prefix without
 * needing live R2 credentials or any network I/O.
 *
 * Run:  npx tsx scripts/test-upload-isolation.ts  → prints UPLOAD_ISOLATION_PASS, exit 0
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

// Force the route's mock-url path: no live R2 writes, deterministic, no network.
delete process.env.R2_ACCESS_KEY_ID;
delete process.env.R2_SECRET_ACCESS_KEY;

function fail(reason: string): never {
  console.error(`UPLOAD_ISOLATION_FAIL: ${reason}`);
  process.exit(1);
}

function assert(cond: unknown, reason: string): asserts cond {
  if (!cond) fail(reason);
}

const OPERATOR_EMAIL = "__upload_op@test.local";
const TENANT_A = "__upload_tenant_a";
const TENANT_A_SLUG = "__upload-tenant-a";
const TENANT_B = "__upload_tenant_b";
const TENANT_B_SLUG = "__upload-tenant-b";

/** A request stub exposing the operator cookie jar + a multipart formData(). */
function stubRequest(cookies: Record<string, string>, formData?: FormData) {
  return {
    cookies: {
      get(name: string) {
        return name in cookies ? { value: cookies[name] } : undefined;
      },
    },
    formData: async () => {
      if (!formData) throw new Error("no form data");
      return formData;
    },
  } as unknown as import("next/server").NextRequest;
}

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { POST: uploadPOST } = await import(
    "../src/app/api/platform/tenants/[id]/upload/route"
  );
  const sharp = (await import("sharp")).default;
  const { SignJWT } = await import("jose");

  const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

  async function mintOperatorCookie(claims: { id: string; email: string; name: string }) {
    return new SignJWT({ ...claims, kind: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(SECRET);
  }

  // A tiny in-memory 10×10 PNG — fresh File per request (one-shot body reads).
  const pngBuffer = await sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();

  function logoForm(extra?: Record<string, string>): FormData {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(pngBuffer)], "logo.png", { type: "image/png" }));
    fd.append("kind", "logo");
    for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
    return fd;
  }

  await cleanup(prisma);

  try {
    const operator = await prisma.platformOperator.create({
      data: { email: OPERATOR_EMAIL, name: "Upload Operator", isActive: true },
    });
    const cookie = await mintOperatorCookie({
      id: operator.id,
      email: operator.email,
      name: operator.name,
    });
    const auth = { "as-platform-session": cookie };

    await prisma.tenant.create({
      data: { id: TENANT_A, slug: TENANT_A_SLUG, name: "Upload Tenant A" },
    });
    await prisma.tenant.create({
      data: { id: TENANT_B, slug: TENANT_B_SLUG, name: "Upload Tenant B" },
    });

    const prefixA = `tenants/${TENANT_A}/branding/`;
    const prefixB = `tenants/${TENANT_B}/branding/`;

    // ── (a) operator-gated: no cookie → 401 ──────────────────────────────────
    const aRes = await uploadPOST(stubRequest({}, logoForm()), withParams(TENANT_A));
    assert(
      aRes.status === 401,
      `(a) no-cookie upload expected 401, got ${aRes.status} — endpoint is not operator-gated!`,
    );

    // ── (b) tenant A, kind=logo, with cookie → 200 + prefix tenants/{A}/branding/
    const bRes = await uploadPOST(stubRequest(auth, logoForm()), withParams(TENANT_A));
    assert(
      bRes.status === 200 || bRes.status === 201,
      `(b) tenant-A upload expected 200/201, got ${bRes.status}`,
    );
    const bBody = await bRes.json();
    assert(
      typeof bBody.url === "string" && bBody.url.includes(prefixA),
      `(b) url should contain "${prefixA}", got "${bBody.url}"`,
    );
    assert(
      !bBody.url.includes(`tenants/${TENANT_B}/`),
      `(b) tenant-A url must NOT contain tenant B's id, got "${bBody.url}"`,
    );

    // ── (c) tenant B → prefix tenants/{B}/branding/, never A's id ─────────────
    const cRes = await uploadPOST(stubRequest(auth, logoForm()), withParams(TENANT_B));
    assert(
      cRes.status === 200 || cRes.status === 201,
      `(c) tenant-B upload expected 200/201, got ${cRes.status}`,
    );
    const cBody = await cRes.json();
    assert(
      typeof cBody.url === "string" && cBody.url.includes(prefixB),
      `(c) url should contain "${prefixB}", got "${cBody.url}"`,
    );
    assert(
      !cBody.url.includes(`tenants/${TENANT_A}/`),
      `(c) tenant-B url must NOT contain tenant A's id, got "${cBody.url}"`,
    );

    // ── (d) body tenantId is IGNORED — path A wins even when body says B ──────
    const dRes = await uploadPOST(
      stubRequest(auth, logoForm({ tenantId: TENANT_B })),
      withParams(TENANT_A),
    );
    assert(
      dRes.status === 200 || dRes.status === 201,
      `(d) spoofed-body upload expected 200/201, got ${dRes.status}`,
    );
    const dBody = await dRes.json();
    assert(
      typeof dBody.url === "string" && dBody.url.includes(prefixA),
      `(d) body tenantId must be ignored — url should still contain "${prefixA}", got "${dBody.url}"`,
    );
    assert(
      !dBody.url.includes(`tenants/${TENANT_B}/`),
      `(d) body tenantId leaked into the key! url="${dBody.url}" contains tenant B's id`,
    );

    // ── (e) the two tenants never share a key prefix ─────────────────────────
    assert(
      !bBody.url.includes(prefixB) && !cBody.url.includes(prefixA),
      "(e) tenant A and tenant B uploads must never share a prefix",
    );

    console.log("UPLOAD_ISOLATION_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  try {
    for (const tid of [TENANT_A, TENANT_B]) {
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await prisma.platformOperator.deleteMany({ where: { email: OPERATOR_EMAIL } });
  } catch (err) {
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("UPLOAD_ISOLATION_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
