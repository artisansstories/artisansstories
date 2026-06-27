/**
 * platform-session.ts — Platform-operator session (P9)
 *
 * Mirrors `src/lib/admin-auth.ts` but for the *operator* identity, which is
 * fully disjoint from any store admin:
 *   - distinct cookie name `as-platform-session` (vs `as-admin-session`)
 *   - JWT HS256 signed with the SAME NEXTAUTH_SECRET, 30-day expiry
 *   - claims `{ id, email, name, kind: "operator" }` — NO tenantId
 *
 * `requirePlatformOperator(req?)` additionally reads the session token straight
 * off a passed request's `Cookie` jar when present — so the same code path works
 * inside a real route handler AND when a test constructs a request carrying a
 * minted session cookie (mirrors the dual approach the existing platform-auth.ts
 * used). It falls back to `next/headers` cookies() when no request is supplied.
 *
 * This phase is DORMANT: nothing reads these helpers yet (the `/platform` app and
 * the `/api/platform` gate cut over in P10). They exist so an operator session
 * can be minted and verified before cutover.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);
const COOKIE_NAME = "as-platform-session";
const SESSION_DURATION = 60 * 60 * 24 * 30; // 30 days

export interface PlatformSession {
  id: string;
  email: string;
  name: string;
  /** Always "operator" — distinguishes these claims from a store-admin JWT. */
  kind: "operator";
}

/** The authorized operator returned by `requirePlatformOperator`. */
export interface PlatformOperatorIdentity {
  id: string;
  email: string;
  name: string;
}

/** Raised by `requirePlatformOperator`; carries the HTTP status to return. */
export class PlatformAuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PlatformAuthError";
    this.status = status;
    this.code = code;
  }
}

/** Anything that exposes request cookies — a real NextRequest, or a test stub. */
type CookieCarrier = {
  cookies?: { get(name: string): { value: string } | undefined };
};

/** Mint the operator JWT and set the `as-platform-session` cookie. */
export async function createPlatformSession(operator: PlatformOperatorIdentity) {
  const claims: PlatformSession = {
    id: operator.id,
    email: operator.email,
    name: operator.name,
    kind: "operator",
  };
  const jwt = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION,
    path: "/",
  });
}

/** Read the operator session claims from the `as-platform-session` cookie, else null. */
export async function getPlatformSession(): Promise<PlatformSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    const claims = payload as unknown as PlatformSession;
    if (claims.kind !== "operator") return null;
    return claims;
  } catch {
    return null;
  }
}

/** Clear the operator session cookie (logout). */
export async function clearPlatformSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Read the operator session JWT from the request cookie, else `next/headers`. */
async function readSessionToken(req?: CookieCarrier): Promise<string | null> {
  const fromReq = req?.cookies?.get?.(COOKIE_NAME)?.value;
  if (fromReq) return fromReq;
  try {
    const store = await cookies();
    return store.get(COOKIE_NAME)?.value ?? null;
  } catch {
    // No request-scoped cookie store (e.g. invoked outside a request) → no token.
    return null;
  }
}

/**
 * Authorize a platform-operator request: verify the cookie JWT, load the
 * `PlatformOperator` row by id, assert it is active.
 * @returns the authenticated operator `{ id, email, name }`.
 * @throws PlatformAuthError 401 (no/invalid session, unknown or inactive operator).
 */
export async function requirePlatformOperator(
  req?: CookieCarrier,
): Promise<PlatformOperatorIdentity> {
  const token = await readSessionToken(req);
  if (!token) throw new PlatformAuthError(401, "unauthorized", "No operator session.");

  let claims: PlatformSession;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    claims = payload as unknown as PlatformSession;
  } catch {
    throw new PlatformAuthError(401, "unauthorized", "Invalid or expired operator session.");
  }

  if (claims.kind !== "operator" || !claims.id) {
    throw new PlatformAuthError(401, "unauthorized", "Not an operator session.");
  }

  const operator = await prisma.platformOperator.findUnique({
    where: { id: claims.id },
    select: { id: true, email: true, name: true, isActive: true },
  });

  if (!operator || !operator.isActive) {
    throw new PlatformAuthError(401, "unauthorized", "Operator not found or inactive.");
  }

  return { id: operator.id, email: operator.email, name: operator.name };
}

/**
 * Map a thrown error to a JSON response when it's a PlatformAuthError, else null
 * (so the caller can rethrow / handle non-auth errors itself).
 */
export function platformAuthErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof PlatformAuthError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  return null;
}
