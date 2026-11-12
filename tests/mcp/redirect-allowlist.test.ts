import { describe, it, expect, afterEach } from "vitest";
import { isAllowedRedirectUri, validateRedirectUris } from "@/lib/mcp/redirect-allowlist";
import { redirectHostAllowlist, DEFAULT_REDIRECT_HOSTS } from "@/lib/mcp/config";

describe("redirect allowlist", () => {
  afterEach(() => {
    delete process.env.MCP_OAUTH_REDIRECT_HOSTS;
  });

  it("defaults to the claude/chatgpt hosts", () => {
    expect([...redirectHostAllowlist()]).toEqual(DEFAULT_REDIRECT_HOSTS);
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
  });

  it("requires https", () => {
    expect(isAllowedRedirectUri("http://claude.ai/cb")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
  });

  it("uses exact hostname matching (no suffix/prefix tricks)", () => {
    for (const bad of [
      "https://evil-claude.ai/cb",
      "https://claude.ai.evil.com/cb",
      "https://evil.com/claude.ai",
      "https://evil.com/?r=https://claude.ai",
      "https://sub.claude.ai/cb",
      "https://claude.ai@evil.com/cb",
      "https://user:pw@claude.ai/cb",
      "not a url",
      "",
    ]) {
      expect(isAllowedRedirectUri(bad), bad).toBe(false);
    }
  });

  it("is case-insensitive on the host", () => {
    expect(isAllowedRedirectUri("https://CLAUDE.AI/cb")).toBe(true);
  });

  it("reads MCP_OAUTH_REDIRECT_HOSTS (comma-separated, trimmed)", () => {
    process.env.MCP_OAUTH_REDIRECT_HOSTS = " muse.meta.com , grok.x.ai ";
    expect(isAllowedRedirectUri("https://muse.meta.com/cb")).toBe(true);
    expect(isAllowedRedirectUri("https://grok.x.ai/cb")).toBe(true);
    expect(isAllowedRedirectUri("https://claude.ai/cb")).toBe(false);
  });

  it("rejects the whole registration if any URI is bad", () => {
    expect(validateRedirectUris(["https://claude.ai/a", "https://claude.com/b"])).toBe(true);
    expect(validateRedirectUris(["https://claude.ai/a", "https://evil.com/b"])).toBe(false);
    expect(validateRedirectUris([])).toBe(false);
    expect(validateRedirectUris("https://claude.ai/a")).toBe(false);
    expect(validateRedirectUris([42])).toBe(false);
  });
});
