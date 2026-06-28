/**
 * api-v1.ts — Shared plumbing for the public v1 Storefront API.
 *
 * Every `/api/v1/store/**` route is API-key authenticated, tenant-scoped, CORS
 * enabled and lightly rate-limited. `withApiKey` centralizes all of that so each
 * route handler is thin: resolve tenant + scopes from the Bearer token, enforce
 * the required scope, apply a best-effort per-key token bucket, and on success
 * invoke `handler({ tenantId, scopes, db })` where `db` is the SCOPED client.
 *
 *   401 — missing/invalid/revoked key
 *   403 — key valid but lacks the required scope
 *   429 — per-key rate limit exceeded (Retry-After seconds)
 *   500 — handler threw
 *
 * CORS is permissive (`Access-Control-Allow-Origin: *`) so a tenant's frontend
 * can call these endpoints directly from the browser. Each route also exports an
 * `OPTIONS` handler (`corsPreflight`) for preflight.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveTenantFromApiKey } from "./tenant-context";
import { getTenantPrisma, type TenantPrisma } from "./tenant-prisma";

/** Recognized scopes for the Storefront API. */
export const SCOPE_STORE_READ = "store:read";
export const SCOPE_CHECKOUT_CREATE = "checkout:create";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Attach permissive CORS headers to any response and return it. */
function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

/** Standard CORS preflight response — re-exported by each route as OPTIONS. */
export function corsPreflight(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}

// ── Rate limiting — best-effort, in-memory token bucket per API key ──────────
// 120 requests/min, refilling continuously. Keyed by the raw token (never the
// hash — we only ever see the raw token here, and it's already a secret). This
// is intentionally simple and per-process; it is NOT a distributed rate limiter.
const RL_CAPACITY = 120;
const RL_REFILL_PER_MS = RL_CAPACITY / 60_000; // tokens restored per millisecond
const buckets = new Map<string, { tokens: number; last: number }>();

function checkRate(key: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: RL_CAPACITY, last: now };
    buckets.set(key, b);
  }
  // Refill based on elapsed time, capped at capacity.
  b.tokens = Math.min(RL_CAPACITY, b.tokens + (now - b.last) * RL_REFILL_PER_MS);
  b.last = now;

  if (b.tokens < 1) {
    const retryAfter = Math.max(1, Math.ceil((1 - b.tokens) / RL_REFILL_PER_MS / 1000));
    return { ok: false, retryAfter };
  }
  b.tokens -= 1;
  return { ok: true, retryAfter: 0 };
}

/** Pull the raw token from `Authorization: Bearer <token>`, or null. */
function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() || null : null;
}

function errorJson(status: number, error: string, extraHeaders?: Record<string, string>): NextResponse {
  return withCors(NextResponse.json({ error }, { status, headers: extraHeaders }));
}

export interface ApiKeyContext {
  tenantId: string;
  tenantSlug: string;
  scopes: string[];
  db: TenantPrisma;
}

/** Fully-qualified canonical storefront URL for a product. */
export function productUrl(tenantSlug: string, productSlug: string): string {
  return `https://${tenantSlug}.artisansstories.com/${productSlug}`;
}

export type ApiHandler = (ctx: ApiKeyContext) => Promise<NextResponse> | NextResponse;

/**
 * Wrap a v1 route handler with auth + scope + CORS + rate-limit. Returns a
 * fully-formed NextResponse in every branch (success or any error code).
 */
export async function withApiKey(
  req: NextRequest,
  requiredScope: string | null,
  handler: ApiHandler,
): Promise<NextResponse> {
  // Rate-limit first (cheap, before any DB work). Only meaningful when a token
  // is present; absent token falls through to the 401 below.
  const token = extractBearer(req);
  if (token) {
    const rl = checkRate(token);
    if (!rl.ok) {
      return errorJson(429, "Rate limit exceeded", { "Retry-After": String(rl.retryAfter) });
    }
  }

  const resolved = await resolveTenantFromApiKey(req);
  if (!resolved) {
    return errorJson(401, "Invalid or missing API key");
  }
  if (requiredScope && !resolved.scopes.includes(requiredScope)) {
    return errorJson(403, `Missing required scope: ${requiredScope}`);
  }

  const db = getTenantPrisma(resolved.tenantId);
  try {
    const res = await handler({ tenantId: resolved.tenantId, tenantSlug: resolved.tenantSlug, scopes: resolved.scopes, db });
    return withCors(res);
  } catch (err) {
    console.error("[api/v1] handler error", err);
    return errorJson(500, "Internal server error");
  }
}

/** Convenience JSON helper that already carries CORS headers. */
export function jsonOk(data: unknown, status = 200): NextResponse {
  return withCors(NextResponse.json(data, { status }));
}

// ── Shared product-card shape (mirrors src/app/api/shop/products) ────────────

/** Prisma `select` for a product "card" — identical fields to the shop list. */
export const PRODUCT_CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  price: true,
  compareAtPrice: true,
  discountType: true,
  promoLabel: true,
  promoTheme: true,
  isFeatured: true,
  totalSold: true,
  tags: true,
  images: {
    orderBy: { position: "asc" as const },
    take: 1,
    select: { url: true, urlMedium: true, altText: true },
  },
  categories: {
    select: { category: { select: { id: true, slug: true, name: true } } },
  },
  variants: {
    select: { id: true, name: true },
    orderBy: { position: "asc" as const },
  },
} as const;

type ProductCardRow = {
  categories: { category: { id: string; slug: string; name: string } }[];
  variants: { id: string; name: string }[];
  [key: string]: unknown;
};

/** Flatten categories + derive variant helpers, matching the shop route output. */
export function mapProductCard(p: ProductCardRow, tenantSlug: string) {
  return {
    ...p,
    url: productUrl(tenantSlug, p.slug as string),
    categories: p.categories.map((pc) => pc.category),
    hasVariants: p.variants.length > 1,
    variantId: p.variants[0]?.id ?? null,
  };
}
