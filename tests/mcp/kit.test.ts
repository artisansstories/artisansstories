import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { writeTool, readTool, normalizeNulls, type ToolCtx } from "@/lib/mcp/kit";

const audit = vi.fn(async () => {});
vi.mock("@/lib/mcp/audit", () => ({ auditMcpWrite: (...a: unknown[]) => audit(...(a as [])) }));

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

describe("read tools", () => {
  it("map thrown errors to a blocked 5xx result instead of isError", async () => {
    const t = readTool({ name: "boom", title: "Boom", description: "x", input: {}, run: async () => { throw new Error("db down"); } });
    const r = await t.handler(ctx, {});
    expect(r.isError).toBeUndefined();
    expect(parse(r)).toMatchObject({ blocked: true, status: 500 });
  });
});
