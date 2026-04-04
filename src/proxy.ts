import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple in-process cache for storeEnabled to avoid DB hit on every request
let storeEnabledCache: { value: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

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
    // On error, default to false (store closed)
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow admin routes, API routes, and static files
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/"
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
    /*
     * Match all request paths except static assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
