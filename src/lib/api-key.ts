/**
 * api-key.ts — Tenant API key generation & hashing (P2)
 *
 * Raw keys are shown to the user exactly ONCE at creation; only the sha256 hash
 * is stored (`TenantApiKey.keyHash`). Inbound requests present the raw token in
 * `Authorization: Bearer <token>`; we sha256 it and look up by hash.
 *
 * Format: `oss_<env>_<32 url-safe random chars>` e.g. `oss_live_xxxx…`.
 *   - `oss`  — Artisans Stories store API namespace.
 *   - `env`  — "live" | "test".
 *   - prefix — first 12 chars (`oss_live_abc…`), safe to display for identifying
 *              a key without revealing the secret.
 */
import { createHash, randomBytes } from "crypto";

/** sha256 hex digest of a raw API token — the value stored as `keyHash`. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** url-safe base64 (no padding) of `n` random bytes, truncated to `len`. */
function urlSafeRandom(len: number): string {
  // 24 bytes → 32 base64 chars before truncation; ample entropy.
  return randomBytes(Math.ceil((len * 3) / 4))
    .toString("base64")
    .replace(/\+/g, "0")
    .replace(/\//g, "0")
    .replace(/=/g, "")
    .slice(0, len);
}

export interface GeneratedApiKey {
  /** Full secret — display to the user ONCE, never persisted. */
  raw: string;
  /** First 12 chars, safe to store/display for identification. */
  prefix: string;
  /** sha256 hex of `raw` — persist this. */
  keyHash: string;
}

/** Generate a fresh API key for the given environment. */
export function generateApiKey(env: "live" | "test"): GeneratedApiKey {
  const raw = `oss_${env}_${urlSafeRandom(32)}`;
  return {
    raw,
    prefix: raw.slice(0, 12),
    keyHash: hashApiKey(raw),
  };
}
