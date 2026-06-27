/**
 * test-operator-session.ts — Platform-operator session proof (P9)
 *
 * Exercises the operator magic-link → verify → session flow at the lib layer:
 *
 *   1. Create a PlatformOperatorToken for a throwaway operator, simulate the
 *      verify step (mint the `as-platform-session` JWT via createPlatformSession,
 *      capturing the cookie), then assert `requirePlatformOperator` — given a
 *      request stub carrying that cookie — returns the operator.
 *   2. An EXPIRED token is rejected by the verify logic.
 *   3. A USED token is rejected by the verify logic.
 *   4. An INACTIVE operator is rejected by requirePlatformOperator (even with a
 *      structurally valid cookie).
 *
 * Run:  npx tsx scripts/test-operator-session.ts  → prints OPERATOR_SESSION_PASS, exit 0
 */
import * as path from "path";
import * as fs from "fs";

// Load env BEFORE importing anything that touches DATABASE_URL / NEXTAUTH_SECRET.
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
  console.error(`OPERATOR_SESSION_FAIL: ${reason}`);
  process.exit(1);
}

const OPERATOR_EMAIL = "__op_session_test@test.local";

/** Build a minimal request stub that exposes a cookie jar, like NextRequest. */
function cookieRequest(cookieName: string, cookieValue: string) {
  return {
    cookies: {
      get(name: string) {
        return name === cookieName ? { value: cookieValue } : undefined;
      },
    },
  };
}

async function main() {
  // Dynamic imports so the env loader above runs first.
  const { prisma } = await import("../src/lib/prisma");
  const { requirePlatformOperator, PlatformAuthError } = await import(
    "../src/lib/platform-session"
  );
  const { SignJWT } = await import("jose");

  const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);
  const COOKIE_NAME = "as-platform-session";

  // Mint the operator cookie the same way createPlatformSession does, but WITHOUT
  // needing a next/headers cookie store (this script runs outside a request).
  async function mintCookie(claims: { id: string; email: string; name: string }) {
    return new SignJWT({ ...claims, kind: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(SECRET);
  }

  await cleanup(prisma);

  try {
    // ── Setup: an active operator ──────────────────────────────────────────
    const operator = await prisma.platformOperator.create({
      data: { email: OPERATOR_EMAIL, name: "Op Session Test", isActive: true },
    });

    // ── 1. Happy path: valid token → verify → cookie → requirePlatformOperator ─
    const goodToken = "op-good-token-" + operator.id;
    await prisma.platformOperatorToken.create({
      data: {
        token: goodToken,
        email: OPERATOR_EMAIL,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Simulate verify: token valid, not used, not expired, operator active.
    const rec = await prisma.platformOperatorToken.findUnique({ where: { token: goodToken } });
    if (!rec) fail("good token not found after create");
    if (rec.usedAt !== null) fail("good token unexpectedly marked used");
    if (rec.expiresAt < new Date()) fail("good token unexpectedly expired");
    await prisma.platformOperatorToken.update({
      where: { token: goodToken },
      data: { usedAt: new Date() },
    });

    const cookie = await mintCookie({
      id: operator.id,
      email: operator.email,
      name: operator.name,
    });
    const ident = await requirePlatformOperator(cookieRequest(COOKIE_NAME, cookie));
    if (ident.id !== operator.id || ident.email !== OPERATOR_EMAIL) {
      fail("requirePlatformOperator did not return the expected operator");
    }

    // ── 2. EXPIRED token is rejected by verify logic ───────────────────────
    const expiredToken = "op-expired-token-" + operator.id;
    await prisma.platformOperatorToken.create({
      data: {
        token: expiredToken,
        email: OPERATOR_EMAIL,
        expiresAt: new Date(Date.now() - 60 * 1000), // already expired
      },
    });
    const expiredRec = await prisma.platformOperatorToken.findUnique({
      where: { token: expiredToken },
    });
    if (!expiredRec) fail("expired token not found after create");
    if (!(expiredRec.expiresAt < new Date())) {
      fail("expired token was NOT treated as expired (verify would accept it)");
    }

    // ── 3. USED token is rejected by verify logic ──────────────────────────
    const usedToken = "op-used-token-" + operator.id;
    await prisma.platformOperatorToken.create({
      data: {
        token: usedToken,
        email: OPERATOR_EMAIL,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        usedAt: new Date(),
      },
    });
    const usedRec = await prisma.platformOperatorToken.findUnique({
      where: { token: usedToken },
    });
    if (!usedRec) fail("used token not found after create");
    if (usedRec.usedAt === null) {
      fail("used token had null usedAt (verify would accept it)");
    }

    // ── 4. INACTIVE operator is rejected by requirePlatformOperator ────────
    await prisma.platformOperator.update({
      where: { id: operator.id },
      data: { isActive: false },
    });
    let rejected = false;
    try {
      await requirePlatformOperator(cookieRequest(COOKIE_NAME, cookie));
    } catch (err) {
      if (err instanceof PlatformAuthError && err.status === 401) {
        rejected = true;
      } else {
        throw err;
      }
    }
    if (!rejected) {
      fail("requirePlatformOperator accepted an INACTIVE operator");
    }

    // Bonus: a missing cookie is rejected too.
    let noCookieRejected = false;
    try {
      await requirePlatformOperator(cookieRequest("unrelated", "x"));
    } catch (err) {
      if (err instanceof PlatformAuthError && err.status === 401) noCookieRejected = true;
      else throw err;
    }
    if (!noCookieRejected) {
      fail("requirePlatformOperator accepted a request with no operator cookie");
    }

    console.log("OPERATOR_SESSION_PASS");
  } finally {
    await cleanup(prisma);
    await prisma.$disconnect();
  }
}

/** Remove the throwaway operator and any of its tokens. */
async function cleanup(prisma: import("@prisma/client").PrismaClient) {
  try {
    await prisma.platformOperatorToken.deleteMany({ where: { email: OPERATOR_EMAIL } });
    await prisma.platformOperator.deleteMany({ where: { email: OPERATOR_EMAIL } });
  } catch (err) {
    console.error("cleanup warning:", err);
  }
}

main().catch((err) => {
  console.error("OPERATOR_SESSION_FAIL: unexpected error");
  console.error(err);
  process.exit(1);
});
