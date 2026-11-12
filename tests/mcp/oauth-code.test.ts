import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, randomBytes } from "crypto";
import { makeNonceStore } from "../helpers/nonce-store";

const store = vi.hoisted(() => ({ current: null as ReturnType<typeof makeNonceStore> | null }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    get mcpNonce() {
      return store.current!.mcpNonce;
    },
    adminUser: { findUnique: async () => ({ id: "user_a", tenantId: "tenant_a", isActive: true }) },
    tenant: { findUnique: async () => ({ status: "ACTIVE" }) },
  },
}));
vi.mock("@/lib/mcp/tenant-flag", () => ({ isTenantMcpEnabled: async () => true }));
// Skip the fixed 500ms failure delay.
vi.mock("@/lib/mcp/oauth", async (orig) => ({
  ...(await orig<typeof import("@/lib/mcp/oauth")>()),
  failureDelay: async () => {},
}));

import { POST, OPTIONS, runtime } from "@/app/oauth/token/route";
import { signAuthCode, clientHash, verifyAccessToken } from "@/lib/mcp/tokens";
import { __resetRateLimits, OAUTH_TOKEN_PER_IP } from "@/lib/mcp/rate-limit";

store.current = makeNonceStore();

const CLIENT_ID = "client-jwt-stand-in";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

async function freshCode() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const code = await signAuthCode({
    sub: "user_a",
    tenantId: "tenant_a",
    scope: "mcp:admin",
    clientHash: clientHash(CLIENT_ID),
    redirectUri: REDIRECT,
    codeChallenge: challenge,
  });
  return { code, verifier };
}

function tokenRequest(code: string, verifier: string, ip = "203.0.113.7") {
  return new Request("https://artisansstories.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
    }).toString(),
  });
}

describe("POST /oauth/token: single-use authorization codes", () => {
  beforeEach(() => {
    store.current!.reset();
    __resetRateLimits();
  });

  it("first exchange issues a token; replaying the code is invalid_grant", async () => {
    const { code, verifier } = await freshCode();
    const first = await POST(tokenRequest(code, verifier));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(await verifyAccessToken(body.access_token)).toMatchObject({ sub: "user_a", tenantId: "tenant_a" });
    const [row] = [...store.current!.rows.values()];
    expect(row).toMatchObject({ kind: "oauth_code", tenantId: "tenant_a" });

    const replay = await POST(tokenRequest(code, verifier));
    expect(replay.status).toBe(400);
    expect(await replay.json()).toEqual({ error: "invalid_grant", error_description: "Code was already used" });
  });

  it("concurrent exchanges of one code issue exactly one token", async () => {
    const { code, verifier } = await freshCode();
    const results = await Promise.all([1, 2, 3].map(() => POST(tokenRequest(code, verifier))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(2);
  });

  it("a wrong PKCE verifier does not burn the code for the real client", async () => {
    const { code, verifier } = await freshCode();
    const bad = await POST(tokenRequest(code, "wrong-verifier-wrong-verifier-wrong-verifier"));
    expect(bad.status).toBe(400);
    expect(store.current!.rows.size).toBe(0);
    expect((await POST(tokenRequest(code, verifier))).status).toBe(200);
  });

  it("fails closed (503, no token) if the claim can't be recorded", async () => {
    const { code, verifier } = await freshCode();
    store.current!.failNextWith(new Error("db down"));
    const res = await POST(tokenRequest(code, verifier));
    expect(res.status).toBe(503);
    expect((await res.json()).access_token).toBeUndefined();
  });

  it("rate-limits one IP with 429 + Retry-After", async () => {
    for (let i = 0; i < OAUTH_TOKEN_PER_IP.limit; i++) await POST(tokenRequest("x", "y", "198.51.100.1"));
    const res = await POST(tokenRequest("x", "y", "198.51.100.1"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("is a Node route with a CORS preflight", async () => {
    expect(runtime).toBe("nodejs");
    const pre = await OPTIONS();
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-headers")).toContain("Mcp-Protocol-Version");
  });
});
