/**
 * test-admin-upload-prefix.ts — tenant-prefixed ADMIN upload keys (U4)
 *
 * Sibling to test-upload-isolation.ts (which covers the OPERATOR endpoint). This
 * proves the contract of POST /api/admin/upload now that U4 derives the key
 * prefix from the ADMIN SESSION:
 *   (a) authenticated admin for tenant A → url under tenants/{A}/products/.
 *   (b) a body-supplied `tenantId` is IGNORED — the prefix still comes from the
 *       SESSION (the path A wins; B never appears in the key).
 *   (c) no admin session → 401 (the A4 gate still holds).
 *
 * The admin route reads its session via `cookies()` from `next/headers` (no
 * request param), so we intercept that module at the CJS loader and feed it a
 * minted `as-admin-session` JWT — the same claims `createAdminSession` writes and
 * the same shape `test-impersonation.ts` mints. R2 creds are stripped so the
 * route takes its "not configured → mock url" branch: no network, deterministic.
 *
 * Run:  npx tsx scripts/test-admin-upload-prefix.ts → prints ADMIN_UPLOAD_PREFIX_PASS, exit 0
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

// ── Intercept `next/headers` BEFORE the admin route (and admin-auth) load it ──
// The admin uploader reads its session via cookies() from next/headers, not from
// the request. We swap that module at the CJS loader so getAdminSession() sees
// whatever JWT we put in `currentCookie` (null ⇒ unauthenticated → 401 path).
let currentCookie: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request === "next/headers") {
    return {
      cookies: async () => ({
        get(name: string) {
          return name === "as-admin-session" && currentCookie
            ? { value: currentCookie }
            : undefined;
        },
      }),
    };
  }
  return origLoad.apply(this, [request, ...rest]);
};

function fail(reason: string): never {
  console.error(`ADMIN_UPLOAD_PREFIX_FAIL: ${reason}`);
  process.exit(1);
}

function assert(cond: unknown, reason: string): asserts cond {
  if (!cond) fail(reason);
}

const TENANT_A = "__admin_upload_tenant_a";
const TENANT_B = "__admin_upload_tenant_b";

/** A request stub exposing only a multipart formData() (cookies come from the
 *  next/headers mock above, exactly like the real admin route). */
function stubRequest(formData: FormData) {
  return {
    formData: async () => formData,
  } as unknown as import("next/server").NextRequest;
}

async function main() {
  const { POST: uploadPOST } = await import("../src/app/api/admin/upload/route");
  const sharp = (await import("sharp")).default;
  const { SignJWT } = await import("jose");

  const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

  async function mintAdminCookie(tenantId: string) {
    return new SignJWT({
      id: "admin-1",
      email: "admin@test.local",
      name: "Test Admin",
      role: "SUPER_ADMIN",
      tenantId,
    })
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

  function productForm(extra?: Record<string, string>): FormData {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(pngBuffer)], "product.png", { type: "image/png" }));
    for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
    return fd;
  }

  const prefixA = `tenants/${TENANT_A}/products/`;

  // ── (c) no admin session → 401 (A4 gate still holds) ────────────────────────
  currentCookie = null;
  const noAuth = await uploadPOST(stubRequest(productForm()));
  assert(
    noAuth.status === 401,
    `(c) no-session upload expected 401, got ${noAuth.status} — admin uploader is not gated!`,
  );

  // ── (a) admin for tenant A → url under tenants/{A}/products/ ─────────────────
  currentCookie = await mintAdminCookie(TENANT_A);
  const aRes = await uploadPOST(stubRequest(productForm()));
  assert(aRes.status === 200, `(a) admin upload expected 200, got ${aRes.status}`);
  const aBody = await aRes.json();
  assert(
    typeof aBody.url === "string" && aBody.url.includes(prefixA),
    `(a) url should contain "${prefixA}", got "${aBody.url}"`,
  );
  assert(
    typeof aBody.urlMedium === "string" && aBody.urlMedium.includes(prefixA) &&
      typeof aBody.urlThumb === "string" && aBody.urlThumb.includes(prefixA),
    `(a) medium/thumb urls must share the tenant prefix, got "${aBody.urlMedium}" / "${aBody.urlThumb}"`,
  );

  // ── (b) body-supplied tenantId is IGNORED — session A wins, B never appears ──
  currentCookie = await mintAdminCookie(TENANT_A);
  const bRes = await uploadPOST(stubRequest(productForm({ tenantId: TENANT_B })));
  assert(bRes.status === 200, `(b) spoofed-body upload expected 200, got ${bRes.status}`);
  const bBody = await bRes.json();
  assert(
    typeof bBody.url === "string" && bBody.url.includes(prefixA),
    `(b) body tenantId must be ignored — url should still contain "${prefixA}", got "${bBody.url}"`,
  );
  assert(
    !bBody.url.includes(`tenants/${TENANT_B}/`),
    `(b) body tenantId leaked into the key! url="${bBody.url}" contains tenant B's id`,
  );

  console.log("ADMIN_UPLOAD_PREFIX_PASS");
}

main().catch((err) => {
  console.error("ADMIN_UPLOAD_PREFIX_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
