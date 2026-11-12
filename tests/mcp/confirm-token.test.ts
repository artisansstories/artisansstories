import { describe, it, expect, afterEach } from "vitest";
import { canonical, signConfirmToken, verifyConfirmToken, idempotencyKeyFor } from "@/lib/mcp/confirm-token";
import { CONFIRM_TOKEN_TTL_MS } from "@/lib/mcp/config";

const T = "tenant_a";

describe("canonical", () => {
  it("sorts keys and drops null/undefined, recursively", () => {
    expect(canonical({ b: 1, a: null, c: { z: 2, y: undefined, x: [{ q: null, p: 1 }] } })).toEqual({
      b: 1,
      c: { x: [{ p: 1 }], z: 2 },
    });
    expect(JSON.stringify(canonical({ b: 1, a: 2 }))).toBe('{"a":2,"b":1}');
  });
});

describe("confirm token", () => {
  const savedSecret = process.env.MCP_TOKEN_SECRET;
  afterEach(() => {
    process.env.MCP_TOKEN_SECRET = savedSecret;
  });

  it("verifies for identical args", () => {
    const tok = signConfirmToken(T, "orders_refund", { orderId: "o1", amount: 500 });
    expect(verifyConfirmToken(tok, T, "orders_refund", { orderId: "o1", amount: 500 })).toBe("ok");
  });

  it("verifies cosmetically different repeats (key order, explicit nulls)", () => {
    const tok = signConfirmToken(T, "orders_refund", { orderId: "o1", amount: 500 });
    expect(verifyConfirmToken(tok, T, "orders_refund", { amount: 500, reason: null, orderId: "o1" })).toBe("ok");
  });

  it("rejects changed args, other tenant, other tool", () => {
    const tok = signConfirmToken(T, "orders_refund", { orderId: "o1", amount: 500 });
    expect(verifyConfirmToken(tok, T, "orders_refund", { orderId: "o1", amount: 5000 })).toBe("mismatch");
    expect(verifyConfirmToken(tok, "tenant_b", "orders_refund", { orderId: "o1", amount: 500 })).toBe("mismatch");
    expect(verifyConfirmToken(tok, T, "orders_cancel", { orderId: "o1", amount: 500 })).toBe("mismatch");
  });

  it("expires after the 10-minute TTL", () => {
    const now = 1_700_000_000_000;
    const tok = signConfirmToken(T, "x", { a: 1 }, now);
    expect(verifyConfirmToken(tok, T, "x", { a: 1 }, now + CONFIRM_TOKEN_TTL_MS - 1)).toBe("ok");
    expect(verifyConfirmToken(tok, T, "x", { a: 1 }, now + CONFIRM_TOKEN_TTL_MS + 1)).toBe("expired");
  });

  it("rejects a forged (extended) expiry", () => {
    const now = 1_700_000_000_000;
    const tok = signConfirmToken(T, "x", { a: 1 }, now);
    const [, sig] = tok.split(".");
    const forged = `${now + 10 * CONFIRM_TOKEN_TTL_MS}.${sig}`;
    expect(verifyConfirmToken(forged, T, "x", { a: 1 }, now + 2 * CONFIRM_TOKEN_TTL_MS)).toBe("mismatch");
  });

  it("rejects malformed tokens and tolerates pasted whitespace", () => {
    expect(verifyConfirmToken("nope", T, "x", {})).toBe("malformed");
    expect(verifyConfirmToken("123.zz", T, "x", {})).toBe("malformed");
    const tok = signConfirmToken(T, "x", { a: 1 });
    const spaced = tok.slice(0, 10) + " \n " + tok.slice(10);
    expect(verifyConfirmToken(spaced, T, "x", { a: 1 })).toBe("ok");
  });

  it("is bound to the secret and fails closed without one", () => {
    const tok = signConfirmToken(T, "x", { a: 1 });
    process.env.MCP_TOKEN_SECRET = "another-secret-another-secret-0123456789";
    expect(verifyConfirmToken(tok, T, "x", { a: 1 })).toBe("mismatch");
    process.env.MCP_TOKEN_SECRET = "";
    expect(() => signConfirmToken(T, "x", { a: 1 })).toThrow(/MCP_TOKEN_SECRET/);
  });

  it("derives a stable idempotency key per confirm token", () => {
    const tok = signConfirmToken(T, "x", { a: 1 });
    expect(idempotencyKeyFor("x", tok)).toBe(idempotencyKeyFor("x", ` ${tok} `));
    expect(idempotencyKeyFor("x", tok)).not.toBe(idempotencyKeyFor("y", tok));
  });
});
