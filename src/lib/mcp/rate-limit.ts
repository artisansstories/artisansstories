/**
 * mcp/rate-limit.ts — best-effort, in-memory, fixed-window rate limiting for
 * /api/mcp and /oauth/token.
 *
 * ⚠️ PER INSTANCE. Each serverless instance keeps its own counters, and they
 * reset on a cold start, so the effective limit across Vercel is
 * `limit × number of warm instances`. This only blunts bursts and brute force
 * from a single client. It is not a quota. For a hard global limit, put a
 * shared store (e.g. Upstash/Redis) or Vercel's WAF rate limiting in front.
 */
import { createHash } from "crypto";

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export const MCP_PER_CREDENTIAL: RateLimit = { limit: 120, windowMs: 60_000 };
export const MCP_PER_IP: RateLimit = { limit: 300, windowMs: 60_000 };
export const OAUTH_TOKEN_PER_IP: RateLimit = { limit: 20, windowMs: 60_000 };

/** Hard cap on tracked keys so a flood of distinct keys can't exhaust memory. */
const MAX_KEYS = 10_000;

const buckets = new Map<string, { count: number; resetAt: number }>();

export type RateVerdict = { ok: true } | { ok: false; retryAfterSec: number };

export function hit(key: string, rule: RateLimit, now: number = Date.now()): RateVerdict {
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    if (!b && buckets.size >= MAX_KEYS) prune(now);
    b = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > rule.limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  return { ok: true };
}

function prune(now: number): void {
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  // Still full of live windows: drop the oldest entries (Map keeps insertion order).
  while (buckets.size >= MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

/** Client IP as seen by Vercel (first x-forwarded-for hop), else "unknown". */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Bucket key for a credential: never keep the raw secret in memory as a key. */
export function credentialKey(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/** Test hook. */
export function __resetRateLimits(): void {
  buckets.clear();
}
