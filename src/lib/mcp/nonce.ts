/**
 * mcp/nonce.ts — single-use claims for MCP credentials.
 *
 * Confirm tokens and OAuth authorization codes are stateless HMAC/JWT values.
 * To make them single-use, the first use INSERTs a row into McpNonce whose
 * primary key is the sha256 of the token. A second use (sequential or
 * concurrent) hits the primary key and loses. The database's unique
 * constraint is the only arbiter, so exactly one claimer wins.
 *
 * Callers must claim BEFORE any side effect and never release the claim
 * afterwards. A side effect that fails halfway can't be safely replayed.
 */
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export type NonceKind = "confirm" | "oauth_code";
export type ClaimResult = "claimed" | "already_used";

/** Rows are kept this long past expiry before cleanup (they're useless after expiry). */
const CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;
/** Prune at most once per this many claims, per instance. */
const CLEANUP_EVERY = 50;
let claimsSinceCleanup = 0;

export function nonceId(token: string): string {
  return createHash("sha256").update(token.replace(/\s+/g, "")).digest("hex");
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "P2002";
}

/**
 * Atomically claim `token`. Returns "already_used" if it was claimed before.
 * Any other database error is THROWN. Callers must treat that as "not
 * claimed" and refuse to act (fail closed).
 */
export async function claimNonce(
  kind: NonceKind,
  token: string,
  tenantId: string,
  expiresAt: Date,
): Promise<ClaimResult> {
  maybeCleanup();
  try {
    await prisma.mcpNonce.create({
      data: { id: nonceId(token), kind, tenantId, expiresAt },
    });
    return "claimed";
  } catch (err) {
    if (isUniqueViolation(err)) return "already_used";
    throw err;
  }
}

/** Fire-and-forget delete of long-expired rows. Never throws, never blocks. */
function maybeCleanup(): void {
  claimsSinceCleanup += 1;
  if (claimsSinceCleanup < CLEANUP_EVERY) return;
  claimsSinceCleanup = 0;
  const cutoff = new Date(Date.now() - CLEANUP_GRACE_MS);
  void Promise.resolve()
    .then(() => prisma.mcpNonce.deleteMany({ where: { expiresAt: { lt: cutoff } } }))
    .catch((err) => console.error("[mcp] nonce cleanup failed:", err));
}

/** Test hook: reset the per-instance cleanup counter. */
export function __resetNonceCleanupCounter(): void {
  claimsSinceCleanup = 0;
}
