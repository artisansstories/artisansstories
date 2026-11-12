import { describe, it, expect } from "vitest";
import { extractToken, stripWhitespace, looksLikeApiKey, pkceS256Matches } from "@/lib/mcp/tokens";
import { createHash } from "crypto";

// Plain carrier (not `Headers`, which rejects newlines) so we can also test
// tokens that picked up line breaks on their way through a chat client.
const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

describe("token extraction + whitespace stripping", () => {
  it("strips every kind of whitespace", () => {
    expect(stripWhitespace(" oss_live_ab\tcd\n ef \r\n")).toBe("oss_live_abcdef");
  });

  it("reads the Authorization header and strips mid-token spaces", () => {
    expect(extractToken(headers({ authorization: "Bearer oss_live_abc def\n ghi" }))).toBe("oss_live_abcdefghi");
    expect(extractToken(headers({ authorization: "bearer   eyJ.a b.c" }))).toBe("eyJ.ab.c");
  });

  it("falls back to the URL path token, decoded and stripped", () => {
    expect(extractToken(headers({}), "oss_live_abc%20def")).toBe("oss_live_abcdef");
    expect(extractToken(headers({}), "oss_live_abc def")).toBe("oss_live_abcdef");
  });

  it("prefers the header over the path", () => {
    expect(extractToken(headers({ authorization: "Bearer oss_live_header" }), "oss_live_path")).toBe("oss_live_header");
  });

  it("returns null when nothing is present", () => {
    expect(extractToken(headers({}))).toBeNull();
    expect(extractToken(headers({ authorization: "Basic abc" }))).toBeNull();
    expect(extractToken(headers({ authorization: "Bearer    " }))).toBeNull();
  });

  it("recognizes API keys only after stripping", () => {
    expect(looksLikeApiKey(stripWhitespace("oss_live_Ab3 xY"))).toBe(true);
    expect(looksLikeApiKey("eyJhbGciOi.x.y")).toBe(false);
  });

  it("verifies PKCE S256", () => {
    const verifier = "a".repeat(43) + "-._~";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(pkceS256Matches(verifier, challenge)).toBe(true);
    expect(pkceS256Matches(verifier + "x", challenge)).toBe(false);
    expect(pkceS256Matches("short", challenge)).toBe(false);
  });
});
