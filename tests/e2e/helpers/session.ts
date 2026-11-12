/**
 * Admin sessions for route tests. `signInAs` calls the REAL createAdminSession
 * (same JWT claims, HS256, NEXTAUTH_SECRET) and captures the cookie it sets in
 * the test cookie jar; the mocked next/headers `cookies()` serves that jar to
 * getAdminSession, exactly as a browser cookie would.
 */
import { createAdminSession, type AdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { cookieStore, clearJar, jarValue, resetHeaders } from "./cookie-jar";

export { setRequestHost } from "./cookie-jar";

const COOKIE = "as-admin-session";

export function signOut(): void {
  clearJar();
  resetHeaders();
}

/** Sign in as a seeded admin (looked up live, like the magic-link verify route). */
export async function signInAs(adminId: string, overrides: Partial<AdminSession> = {}): Promise<string> {
  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  clearJar();
  await createAdminSession({ id: admin.id, email: admin.email, name: admin.name, role: admin.role, tenantId: admin.tenantId, ...overrides });
  return jarValue(COOKIE)!;
}

/** Raw session cookie value for HTTP requests to a running `next start`. */
export function sessionCookieHeader(): string {
  const v = jarValue(COOKIE);
  if (!v) throw new Error("not signed in");
  return `${COOKIE}=${v}`;
}

/** Install an arbitrary cookie value (e.g. a forged or expired token). */
export function setRawSessionCookie(value: string | null): void {
  clearJar();
  if (value !== null) cookieStore.set(COOKIE, value);
}
