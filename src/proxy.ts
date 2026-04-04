import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

// Simple in-process cache for storeEnabled to avoid DB hit on every request
let storeEnabledCache: { value: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

async function getStoreEnabled(): Promise<boolean> {
  const now = Date.now();
  if (storeEnabledCache && now < storeEnabledCache.expiresAt) {
    return storeEnabledCache.value;
  }

  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const result = await client.query<{ storeEnabled: boolean }>(
      'SELECT "storeEnabled" FROM "StoreSettings" WHERE id = $1 LIMIT 1',
      ["singleton"]
    );
    await client.end();
    const value = result.rows[0]?.storeEnabled ?? false;
    storeEnabledCache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public admin paths that don't need auth
  const isAdminPublic =
    pathname === "/admin/login" ||
    pathname === "/admin/login/" ||
    pathname.startsWith("/api/auth/admin/magic-link") ||
    pathname.startsWith("/api/auth/admin/verify");

  // Protect /admin/* UI routes
  if (pathname.startsWith("/admin") && !isAdminPublic) {
    const token = request.cookies.get("as-admin-session")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    try {
      await jwtVerify(token, SECRET);
    } catch {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      res.cookies.delete("as-admin-session");
      return res;
    }
  }

  // Protect /api/admin/* routes
  if (pathname.startsWith("/api/admin")) {
    const token = request.cookies.get("as-admin-session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      await jwtVerify(token, SECRET);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Always allow API routes, static files, account routes, and public pages
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/favicon") ||
    pathname === "/" ||
    pathname === "/about" ||
    pathname === "/contact" ||
    pathname === "/shipping-policy" ||
    pathname === "/returns-policy" ||
    pathname === "/privacy" ||
    pathname === "/terms"
  ) {
    return NextResponse.next();
  }

  // Gate /shop/* routes behind storeEnabled
  if (pathname.startsWith("/shop")) {
    const enabled = await getStoreEnabled();
    if (!enabled) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
