import { prisma } from "@/lib/prisma";
import { ACCESS_TOKEN_TTL_SECONDS, mcpGloballyEnabled } from "@/lib/mcp/config";
import { CORS_HEADERS, failureDelay, jsonCors, notFound } from "@/lib/mcp/oauth";
import { isTenantMcpEnabled } from "@/lib/mcp/tenant-flag";
import { clientHash, pkceS256Matches, signAccessToken, verifyAuthCode } from "@/lib/mcp/tokens";
import { claimNonce } from "@/lib/mcp/nonce";
import { OAUTH_TOKEN_PER_IP, clientIp, hit } from "@/lib/mcp/rate-limit";

/**
 * POST /oauth/token — authorization_code grant with PKCE (S256).
 * Accepts application/x-www-form-urlencoded (standard) or JSON.
 * Re-checks the admin user and the store's MCP switch before issuing.
 * Codes are single-use: after the code, client, redirect_uri and PKCE all
 * check out, the code is claimed in McpNonce. A replay gets invalid_grant.
 * Claiming only after PKCE stops someone who holds a stolen code without the
 * verifier from burning the real client's code.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) if (typeof v === "string") p.set(k, v);
    return p;
  }
  return new URLSearchParams(await request.text());
}

async function invalidGrant(description: string) {
  await failureDelay();
  return jsonCors({ error: "invalid_grant", error_description: description }, 400);
}

export async function POST(request: Request) {
  if (!mcpGloballyEnabled()) return notFound();
  // Best-effort, per-instance brute-force guard (see rate-limit.ts).
  const rl = hit(`oauth-token:ip:${clientIp(request)}`, OAUTH_TOKEN_PER_IP);
  if (!rl.ok) {
    return jsonCors(
      { error: "slow_down", error_description: "Too many token requests. Retry later." },
      429,
      { "Retry-After": String(rl.retryAfterSec) },
    );
  }
  const p = await readParams(request);

  if (p.get("grant_type") !== "authorization_code") {
    return jsonCors({ error: "unsupported_grant_type" }, 400);
  }
  const code = p.get("code") ?? "";
  const verifier = p.get("code_verifier") ?? "";
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";

  const claims = code ? await verifyAuthCode(code) : null;
  if (!claims) return invalidGrant("Code is invalid or expired");
  if (!clientId || claims.clientHash !== clientHash(clientId)) return invalidGrant("Code was not issued to this client");
  if (claims.redirectUri !== redirectUri) return invalidGrant("redirect_uri does not match");
  if (!pkceS256Matches(verifier, claims.codeChallenge)) return invalidGrant("PKCE verification failed");

  let claim: Awaited<ReturnType<typeof claimNonce>>;
  try {
    const expiresAt = claims.expiresAt ?? new Date(Date.now() + 5 * 60_000);
    claim = await claimNonce("oauth_code", code, claims.tenantId, expiresAt);
  } catch (err) {
    console.error("[mcp] oauth code claim failed:", err);
    return jsonCors({ error: "temporarily_unavailable", error_description: "Try again shortly" }, 503);
  }
  if (claim === "already_used") return invalidGrant("Code was already used");

  const user = await prisma.adminUser.findUnique({
    where: { id: claims.sub },
    select: { id: true, tenantId: true, isActive: true },
  });
  if (!user || !user.isActive || user.tenantId !== claims.tenantId) return invalidGrant("Admin account is not active");
  const tenant = await prisma.tenant.findUnique({ where: { id: claims.tenantId }, select: { status: true } });
  if (!tenant || tenant.status !== "ACTIVE") return invalidGrant("Store is not active");
  if (!(await isTenantMcpEnabled(claims.tenantId))) return invalidGrant("AI assistant access is turned off for this store");

  const accessToken = await signAccessToken({ sub: user.id, tenantId: claims.tenantId, scope: claims.scope });
  return jsonCors({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: claims.scope,
  });
}

export async function OPTIONS() {
  if (!mcpGloballyEnabled()) return notFound();
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
