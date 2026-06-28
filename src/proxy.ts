import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { parseTenantHost } from "@/lib/tenant-host";

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

  // ── Subdomain routing (T2) ────────────────────────────────────────────────
  // `{slug}.artisansstories.com` is a tenant's own store + admin. The apex / www
  // (and dev localhost) is tenant zero and keeps every existing behavior below.
  const routing = parseTenantHost(request.headers.get("host"));
  const isSubdomain = routing.kind === "subdomain";

  // The platform/operator app lives ONLY on the apex. If someone reaches it via
  // a tenant subdomain, bounce them to the same path on the root domain.
  if (
    isSubdomain &&
    (pathname.startsWith("/platform") || pathname.startsWith("/api/auth/platform"))
  ) {
    const url = request.nextUrl.clone();
    url.host = routing.rootHost;
    return NextResponse.redirect(url);
  }

  // Public admin paths that don't need auth
  const isAdminPublic =
    pathname === "/admin/login" ||
    pathname === "/admin/login/" ||
    pathname.startsWith("/api/auth/admin/magic-link") ||
    pathname.startsWith("/api/auth/admin/verify");

  // Protect /admin/* UI routes
  if (pathname.startsWith("/admin") && !isAdminPublic) {
    // Preserve the intended destination so login can return the user there.
    const intended = pathname + request.nextUrl.search;
    const loginUrl = new URL("/admin/login", request.url);
    if (intended && intended !== "/admin") {
      loginUrl.searchParams.set("callbackUrl", intended);
    }
    const token = request.cookies.get("as-admin-session")?.value;
    if (!token) {
      return NextResponse.redirect(loginUrl);
    }
    try {
      await jwtVerify(token, SECRET);
    } catch {
      const res = NextResponse.redirect(loginUrl);
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

  // Public platform-operator paths that don't need an operator session.
  const isPlatformPublic =
    pathname === "/platform/login" ||
    pathname === "/platform/login/" ||
    pathname.startsWith("/api/auth/platform/");

  // Protect /platform/* UI routes (operator app). Edge-safe JWT check only —
  // identity/isActive is enforced in-route by requirePlatformOperator.
  if (pathname.startsWith("/platform") && !isPlatformPublic) {
    // Preserve the intended destination so login can return the operator there.
    const intended = pathname + request.nextUrl.search;
    const loginUrl = new URL("/platform/login", request.url);
    if (intended && intended !== "/platform") {
      loginUrl.searchParams.set("callbackUrl", intended);
    }
    const token = request.cookies.get("as-platform-session")?.value;
    if (!token) {
      return NextResponse.redirect(loginUrl);
    }
    try {
      await jwtVerify(token, SECRET);
    } catch {
      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete("as-platform-session");
      return res;
    }
  }

  // Protect /api/platform/* routes. MUST precede the generic `/api` allow below,
  // or these would fall through unprotected. (/api/auth/platform/* is public.)
  if (pathname.startsWith("/api/platform")) {
    const token = request.cookies.get("as-platform-session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      await jwtVerify(token, SECRET);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // On a tenant subdomain, the admin UI + every API + Next internals were already
  // gated/allowed above (tenant is resolved per-request from the host). Anything
  // else is the public storefront: render this tenant's white-label store by
  // rewriting to its `/t/{slug}` route tree (e.g. `/` → `/t/{slug}`,
  // `/some-product` → `/t/{slug}/some-product`).
  if (isSubdomain) {
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next")
    ) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = `/t/${routing.slug}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
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
