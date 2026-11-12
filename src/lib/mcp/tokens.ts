/**
 * mcp/tokens.ts — credential extraction + stateless OAuth artifacts.
 *
 * No DB tables: OAuth client ids, authorization codes and access tokens are all
 * HS256 JWTs signed with MCP_TOKEN_SECRET, each with a distinct `typ` claim so
 * one kind can never be replayed as another.
 *
 *   client  — RFC 7591 client_id; carries the validated redirect_uris.
 *   code    — authorization code; bound to client, redirect_uri, PKCE challenge.
 *   access  — bearer for /api/mcp; carries sub (AdminUser.id), tenantId, scope.
 */
import { SignJWT, jwtVerify } from "jose";
import { createHash } from "crypto";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  MCP_TOKEN_ISSUER,
  mcpSecret,
} from "./config";

export type McpScope = "mcp:admin" | "mcp:read";
export const MCP_SCOPES: readonly McpScope[] = ["mcp:admin", "mcp:read"];

export function isMcpScope(s: unknown): s is McpScope {
  return s === "mcp:admin" || s === "mcp:read";
}

/** Strip ALL whitespace — pasted tokens pick up spaces/newlines (spec §3.4). */
export function stripWhitespace(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/**
 * Pull the credential from `Authorization: Bearer …`, falling back to the
 * `/api/mcp/<token>` path segment. Returns null when neither is present.
 */
export function extractToken(headers: { get(name: string): string | null }, pathToken?: string | null): string | null {
  const header = headers.get("authorization");
  if (header) {
    const m = /^\s*Bearer\s+([\s\S]+)$/i.exec(header);
    if (m) {
      const t = stripWhitespace(m[1]);
      if (t) return t;
    }
  }
  if (pathToken) {
    let decoded = pathToken;
    try {
      decoded = decodeURIComponent(pathToken);
    } catch {
      // keep raw
    }
    const t = stripWhitespace(decoded);
    if (t) return t;
  }
  return null;
}

/** Tenant API keys look like `oss_live_…`; everything else is treated as a JWT. */
export function looksLikeApiKey(token: string): boolean {
  return /^oss_(live|test)_[A-Za-z0-9]+$/.test(token);
}

function b64urlSha256(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

/** PKCE S256: BASE64URL(SHA256(verifier)) === challenge. */
export function pkceS256Matches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return b64urlSha256(verifier) === challenge;
}

// ── OAuth client id ─────────────────────────────────────────────────────────

export interface ClientClaims {
  redirect_uris: string[];
  client_name?: string;
}

export async function signClientId(claims: ClientClaims): Promise<string> {
  return new SignJWT({ typ: "client", ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(MCP_TOKEN_ISSUER)
    .setIssuedAt()
    .sign(mcpSecret());
}

export async function verifyClientId(clientId: string): Promise<ClientClaims | null> {
  try {
    const { payload } = await jwtVerify(stripWhitespace(clientId), mcpSecret(), {
      issuer: MCP_TOKEN_ISSUER,
      algorithms: ["HS256"],
    });
    if (payload.typ !== "client" || !Array.isArray(payload.redirect_uris)) return null;
    return {
      redirect_uris: payload.redirect_uris as string[],
      client_name: typeof payload.client_name === "string" ? payload.client_name : undefined,
    };
  } catch {
    return null;
  }
}

// ── Authorization code ──────────────────────────────────────────────────────

export interface CodeClaims {
  sub: string; // AdminUser.id
  tenantId: string;
  scope: McpScope;
  clientHash: string; // sha256 of client_id (keeps the code short)
  redirectUri: string;
  codeChallenge: string;
}

export function clientHash(clientId: string): string {
  return b64urlSha256(stripWhitespace(clientId));
}

export async function signAuthCode(c: CodeClaims): Promise<string> {
  return new SignJWT({
    typ: "code",
    tenantId: c.tenantId,
    scope: c.scope,
    cid: c.clientHash,
    ruri: c.redirectUri,
    cc: c.codeChallenge,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(MCP_TOKEN_ISSUER)
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${AUTH_CODE_TTL_SECONDS}s`)
    .sign(mcpSecret());
}

export async function verifyAuthCode(code: string): Promise<CodeClaims | null> {
  try {
    const { payload } = await jwtVerify(stripWhitespace(code), mcpSecret(), {
      issuer: MCP_TOKEN_ISSUER,
      algorithms: ["HS256"],
    });
    if (payload.typ !== "code" || !payload.sub || typeof payload.tenantId !== "string") return null;
    if (!isMcpScope(payload.scope)) return null;
    return {
      sub: payload.sub,
      tenantId: payload.tenantId,
      scope: payload.scope,
      clientHash: String(payload.cid),
      redirectUri: String(payload.ruri),
      codeChallenge: String(payload.cc),
    };
  } catch {
    return null;
  }
}

// ── Access token ────────────────────────────────────────────────────────────

export interface AccessClaims {
  sub: string; // AdminUser.id
  tenantId: string;
  scope: McpScope;
  via: "mcp";
}

export async function signAccessToken(c: Omit<AccessClaims, "via">): Promise<string> {
  return new SignJWT({ typ: "access", tenantId: c.tenantId, scope: c.scope, via: "mcp" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(MCP_TOKEN_ISSUER)
    .setAudience(MCP_TOKEN_ISSUER)
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(mcpSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(stripWhitespace(token), mcpSecret(), {
      issuer: MCP_TOKEN_ISSUER,
      audience: MCP_TOKEN_ISSUER,
      algorithms: ["HS256"],
    });
    if (payload.typ !== "access" || !payload.sub || typeof payload.tenantId !== "string") return null;
    if (!isMcpScope(payload.scope)) return null;
    return { sub: payload.sub, tenantId: payload.tenantId, scope: payload.scope, via: "mcp" };
  } catch {
    return null;
  }
}
