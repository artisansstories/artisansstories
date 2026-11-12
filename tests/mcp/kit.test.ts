import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { makeNonceStore } from "../helpers/nonce-store";

const store = vi.hoisted(() => ({ current: null as ReturnType<typeof makeNonceStore> | null }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    get mcpNonce() {
      return store.current!.mcpNonce;
    },
  },
}));
const audit = vi.fn(async () => {});
vi.mock("@/lib/mcp/audit", () => ({ auditMcpWrite: (...a: unknown[]) => audit(...(a as [])) }));

import { writeTool, readTool, normalizeNulls, statusToolFor, ALREADY_USED_REASON, type ToolCtx } from "@/lib/mcp/kit";
import { ALL_TOOLS } from "@/lib/mcp/tools";

store.current = makeNonceStore();

const ctx = { tenantId: "tenant_a", db: {} } as unknown as ToolCtx;
const parse = (r: { content: Array<{ type: string; text?: string }> }) => JSON.parse(r.content[0].text as string);

describe("normalizeNulls", () => {
  it("drops nulls recursively", () => {
    expect(normalizeNulls({ a: null, b: { c: null, d: 1 }, e: [null, 2] })).toEqual({ b: { d: 1 }, e: [undefined, 2] });
  });
});

describe("preview → confirm", () => {
  const preview = vi.fn(async (_c: ToolCtx, a: { id: string; amount?: number }) => ({ ok: true as const, data: { willRefund: a.amount ?? 100 } }));
  const execute = vi.fn(async () => ({ ok: true as const, data: { refunded: true } }));
  const tool = writeTool({
    name: "test_refund",
    title: "Test refund",
    kind: "sensitive",
    description: "Refund.",
    input: { id: z.string(), amount: z.number().int().nullish() },
    preview,
    execute,
  });

  beforeEach(() => {
    preview.mockClear();
    execute.mockClear();
    audit.mockClear();
    store.current!.reset();
  });

  it("first call previews and writes nothing", async () => {
    const out = parse(await tool.handler(ctx, { id: "o1", amount: 50 }));
    expect(out).toMatchObject({ done: false, status: "pending_confirmation", preview: { willRefund: 50 } });
    expect(typeof out.confirmToken).toBe("string");
    expect(execute).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("second call with the token (keys reordered, null padding) executes and audits", async () => {
    const { confirmToken } = parse(await tool.handler(ctx, { id: "o1", amount: 50 }));
    const out = parse(await tool.handler(ctx, { amount: 50, id: "o1", confirmToken }));
    expect(out).toEqual({ done: true, status: "confirmed", result: { refunded: true } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(ctx, "test_refund", { id: "o1", amount: 50 }, "confirmed", undefined);
  });

  it("a token for different args is blocked, not executed", async () => {
    const { confirmToken } = parse(await tool.handler(ctx, { id: "o1", amount: 50 }));
    const out = parse(await tool.handler(ctx, { id: "o1", amount: 5000, confirmToken }));
    expect(out).toMatchObject({ done: false, blocked: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it("a token from another tenant is blocked", async () => {
    const { confirmToken } = parse(await tool.handler(ctx, { id: "o1" }));
    const other = { ...ctx, tenantId: "tenant_b" } as ToolCtx;
    const out = parse(await tool.handler(other, { id: "o1", confirmToken }));
    expect(out).toMatchObject({ blocked: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it("explicit null optional fields are accepted", async () => {
    const out = parse(await tool.handler(ctx, { id: "o1", amount: null, confirmToken: null }));
    expect(out.status).toBe("pending_confirmation");
  });

  it("maps service failures to structured blocked results with retry guidance", async () => {
    preview.mockResolvedValueOnce({ ok: false, status: 400, body: { error: "Order is not in a refundable state" } } as never);
    const out = parse(await tool.handler(ctx, { id: "o1" }));
    expect(out).toMatchObject({ done: false, blocked: true, reason: "Order is not in a refundable state", status: 400 });
    expect(out.retry).toMatch(/do not retry/i);
  });
});

describe("single-use confirm tokens", () => {
  const execute = vi.fn(async () => ({ ok: true as const, data: { refunded: true } }));
  const tool = writeTool({
    name: "orders_refund",
    title: "Refund",
    kind: "sensitive",
    description: "Refund.",
    input: { id: z.string() },
    preview: async () => ({ ok: true as const, data: { willRefund: 100 } }),
    execute,
  });
  const confirmTokenFor = async () => parse(await tool.handler(ctx, { id: "o1" })).confirmToken as string;

  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue({ ok: true as const, data: { refunded: true } });
    audit.mockClear();
    store.current!.reset();
  });

  it("a second use of the same token is blocked and does not execute again", async () => {
    const confirmToken = await confirmTokenFor();
    const first = parse(await tool.handler(ctx, { id: "o1", confirmToken }));
    const second = parse(await tool.handler(ctx, { id: "o1", confirmToken }));
    expect(first).toMatchObject({ done: true, status: "confirmed" });
    expect(second).toMatchObject({ done: false, blocked: true, reason: ALREADY_USED_REASON });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("whitespace in a pasted token doesn't make it a different nonce", async () => {
    const confirmToken = await confirmTokenFor();
    await tool.handler(ctx, { id: "o1", confirmToken });
    const spaced = `${confirmToken.slice(0, 10)}\n ${confirmToken.slice(10)}`;
    const second = parse(await tool.handler(ctx, { id: "o1", confirmToken: spaced }));
    expect(second).toMatchObject({ blocked: true, reason: ALREADY_USED_REASON });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("two concurrent confirms with one token yield exactly one success", async () => {
    const confirmToken = await confirmTokenFor();
    const results = (await Promise.all([
      tool.handler(ctx, { id: "o1", confirmToken }),
      tool.handler(ctx, { id: "o1", confirmToken }),
      tool.handler(ctx, { id: "o1", confirmToken }),
    ])).map(parse);
    expect(results.filter((r) => r.done === true)).toHaveLength(1);
    expect(results.filter((r) => r.reason === ALREADY_USED_REASON)).toHaveLength(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("claims the token before the side effect", async () => {
    const confirmToken = await confirmTokenFor();
    execute.mockImplementationOnce(async () => {
      expect(store.current!.rows.size).toBe(1);
      return { ok: true as const, data: { refunded: true } };
    });
    await tool.handler(ctx, { id: "o1", confirmToken });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("a DB error while claiming fails closed: nothing executes", async () => {
    const confirmToken = await confirmTokenFor();
    store.current!.failNextWith(new Error("connection reset"));
    const out = parse(await tool.handler(ctx, { id: "o1", confirmToken }));
    expect(out).toMatchObject({ done: false, blocked: true });
    expect(out.reason).toMatch(/nothing was changed/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it("if the side effect throws, the token stays claimed and the result says status unknown + which tool to check", async () => {
    const confirmToken = await confirmTokenFor();
    execute.mockRejectedValueOnce(new Error("stripe timeout"));
    const out = parse(await tool.handler(ctx, { id: "o1", confirmToken }));
    expect(out).toMatchObject({ done: false, blocked: true, status: "unknown", checkWith: "orders_get" });
    expect(out.retry).toContain("orders_get");
    const again = parse(await tool.handler(ctx, { id: "o1", confirmToken }));
    expect(again).toMatchObject({ blocked: true, reason: ALREADY_USED_REASON });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("every write tool maps to a status tool that exists", () => {
    const names = new Set(ALL_TOOLS.map((t) => t.name));
    for (const t of ALL_TOOLS.filter((t) => t.kind !== "read")) {
      const check = statusToolFor(t.name);
      expect(check, `${t.name} has no status tool`).toBeTruthy();
      expect(names.has(check!), `${t.name} → ${check} is not a tool`).toBe(true);
    }
  });
});

describe("read tools", () => {
  it("map thrown errors to a blocked 5xx result instead of isError", async () => {
    const t = readTool({ name: "boom", title: "Boom", description: "x", input: {}, run: async () => { throw new Error("db down"); } });
    const r = await t.handler(ctx, {});
    expect(r.isError).toBeUndefined();
    expect(parse(r)).toMatchObject({ blocked: true, status: 500 });
  });
});
