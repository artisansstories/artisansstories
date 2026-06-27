/**
 * platform-auth.ts — Platform-operator authorization for `/api/platform/**` (P6)
 *
 * AUTH POSTURE (matches the existing connect / theme / stripe-status routes):
 * a request is authorized only when it carries a VALID admin session whose
 * owning tenant is the platform owner (`Tenant.isPlatformOwner = true`). This
 * keeps tenant CRUD, API-key minting, Stripe onboarding and theming as
 * platform-operator actions — an arbitrary tenant admin must NOT be able to act
 * on an arbitrary tenant id. Tighten to a dedicated platform-operator role
 * post-POC.
 *
 * The three pre-existing platform routes inlined this check against
 * `getAdminSession()` (which reads the cookie via `next/headers`). This helper
 * consolidates it and additionally reads the session token straight off the
 * request's `Cookie` header when present — so the same code path works inside a
 * real route handler AND when a test constructs a `NextRequest` with a minted
 * session cookie (see scripts/test-onboarding.ts). It falls back to
 * `next/headers` cookies() when no request is supplied.
 */
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import type { AdminSession } from "./admin-auth";

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);
const COOKIE_NAME = "as-admin-session";

/** Raised by `requirePlatformAdmin`; carries the HTTP status to return. */
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

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Always the platform-owner tenant id once authorized. */
  tenantId: string;
}

/** Read the admin session JWT from the request cookie, else `next/headers`. */
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
 * Authorize a platform-operator request.
 * @returns the authenticated platform admin.
 * @throws PlatformAuthError 401 (no/invalid session) or 403 (not platform owner).
 */
export async function requirePlatformAdmin(req?: CookieCarrier): Promise<PlatformAdmin> {
  const token = await readSessionToken(req);
  if (!token) throw new PlatformAuthError(401, "unauthorized", "No admin session.");

  let session: AdminSession;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    session = payload as unknown as AdminSession;
  } catch {
    throw new PlatformAuthError(401, "unauthorized", "Invalid or expired admin session.");
  }

  // Resolve the admin's owning tenant (sessions minted before P2 carry no tenantId).
  let tenantId = session.tenantId;
  if (!tenantId) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: session.id },
      select: { tenantId: true },
    });
    tenantId = admin?.tenantId ?? undefined;
  }

  const ownerTenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { isPlatformOwner: true },
      })
    : null;

  if (!ownerTenant?.isPlatformOwner) {
    throw new PlatformAuthError(
      403,
      "forbidden",
      "This action is restricted to platform-owner admins.",
    );
  }

  return {
    id: session.id,
    email: session.email,
    name: session.name,
    role: session.role,
    tenantId: tenantId!,
  };
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
