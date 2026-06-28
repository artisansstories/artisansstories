import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);
const COOKIE_NAME = "as-admin-session";
const SESSION_DURATION = 60 * 60 * 24 * 30; // 30 days

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Owning tenant. Optional for back-compat with sessions minted before P2. */
  tenantId?: string;
  /**
   * Impersonation claims (P10). Present ONLY when a platform operator minted this
   * admin session via `/api/platform/tenants/[id]/impersonate`. Additive and
   * optional — normal store-admin logins never set these, so existing behavior
   * (and tenant scoping, which keys off `tenantId`) is unchanged. A store admin
   * can never set these: only the operator-gated endpoint can.
   */
  impersonatedBy?: string;
  impersonatorEmail?: string;
}

export async function createAdminSession(user: AdminSession) {
  const jwt = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);

  const cookieStore = await cookies();
  // No `domain` attribute on purpose → the cookie is HOST-ONLY, scoped to the
  // exact host that set it. On a tenant subdomain (`{slug}.artisansstories.com`)
  // the session therefore stays confined to that one store and never leaks to
  // the apex or sibling tenants — the more-secure option (T2). The magic-link →
  // verify → /admin flow all runs on one host (see originFromRequest), so a
  // host-only cookie is sufficient.
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION,
    path: "/",
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
