/**
 * mcp/confirm-token.ts — stateless preview → confirm tokens (spec §5).
 *
 * A write tool called without `confirmToken` returns a preview plus a token
 * that is an HMAC over (tenant, tool, canonical args, expiry). Calling again
 * with that token and the SAME args executes the write. Canonicalization sorts
 * object keys and drops null/undefined, so a cosmetically different repeat of
 * the same call (reordered keys, explicit nulls) still verifies.
 */
import { createHmac, createHash, timingSafeEqual } from "crypto";
import { CONFIRM_TOKEN_TTL_MS, mcpSecretString } from "./config";

export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .filter((k) => obj[k] !== null && obj[k] !== undefined)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = canonical(obj[k]);
        return acc;
      }, {});
  }
  return value;
}

function payload(tenantId: string, tool: string, args: unknown, expiry: number): string {
  return `${tenantId}|${tool}|${JSON.stringify(canonical(args))}|${expiry}`;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function signConfirmToken(
  tenantId: string,
  tool: string,
  args: unknown,
  now: number = Date.now(),
): string {
  const secret = mcpSecretString();
  const expiry = now + CONFIRM_TOKEN_TTL_MS;
  return `${expiry}.${sign(payload(tenantId, tool, args, expiry), secret)}`;
}

export type ConfirmVerdict = "ok" | "expired" | "mismatch" | "malformed";

export function verifyConfirmToken(
  token: string,
  tenantId: string,
  tool: string,
  args: unknown,
  now: number = Date.now(),
): ConfirmVerdict {
  const secret = mcpSecretString();
  const clean = token.replace(/\s+/g, "");
  const dot = clean.indexOf(".");
  if (dot <= 0) return "malformed";
  const expiryStr = clean.slice(0, dot);
  const sig = clean.slice(dot + 1);
  if (!/^\d+$/.test(expiryStr) || !/^[0-9a-f]{64}$/.test(sig)) return "malformed";
  const expiry = Number(expiryStr);
  // Recompute over the claimed expiry; a forged expiry fails the HMAC.
  const expected = sign(payload(tenantId, tool, args, expiry), secret);
  const ok = timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  if (!ok) return "mismatch";
  if (now > expiry) return "expired";
  return "ok";
}

/** Expiry encoded in a confirm token (only meaningful after verifyConfirmToken said "ok"). */
export function confirmTokenExpiry(token: string): Date {
  const clean = token.replace(/\s+/g, "");
  return new Date(Number(clean.slice(0, clean.indexOf("."))));
}

/**
 * Deterministic idempotency key for a confirmed write, derived from its confirm
 * token. Passed to Stripe so a retried confirm with the same token can't create
 * a second refund/capture.
 */
export function idempotencyKeyFor(tool: string, confirmToken: string): string {
  const h = createHash("sha256").update(`${tool}|${confirmToken.replace(/\s+/g, "")}`).digest("hex");
  return `mcp_${h.slice(0, 40)}`;
}
