import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Shared, ordered log of every side effect so we can assert sequencing.
const calls: string[] = [];

// ── auth / tenant ────────────────────────────────────────────────────────────
const getAdminSession = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  getAdminSession: (...a: unknown[]) => getAdminSession(...a),
}));

// Mirrors the real chain: getTenantPrismaForAdmin resolves the tenant from the
// admin session and throws TenantResolutionError when there is none.
const db = {
  $tenantId: "tenant_a",
  return: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  order: { update: vi.fn() },
  inventory: { findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  inventoryLog: { create: vi.fn() },
  productVariant: { findMany: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("@/lib/tenant-context", async () => {
  const { TenantResolutionError, tenantContextBase } = await import("../helpers/tenant-context-mock");
  return {
    ...tenantContextBase,
    getTenantPrismaForAdmin: async () => {
      const s = await getAdminSession();
      if (!s?.tenantId) throw new TenantResolutionError("No admin session");
      return db;
    },
  };
});

// ── stripe ───────────────────────────────────────────────────────────────────
const piRetrieve = vi.fn();
const refundCreate = vi.fn();
const refundList = vi.fn(async (..._a: unknown[]) => ({ data: [] as Array<{ id: string; amount: number; status: string; metadata: Record<string, string> }> }));
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { retrieve: (...a: unknown[]) => piRetrieve(...a) };
    refunds = { create: (...a: unknown[]) => refundCreate(...a), list: (...a: unknown[]) => refundList(...a) };
  },
}));

// ── email senders ────────────────────────────────────────────────────────────
const resendSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => resendSend(...a) };
  },
}));
const logEmail = vi.fn();
vi.mock("@/lib/email-log", () => ({ logEmail: (...a: unknown[]) => logEmail(...a) }));
vi.mock("@/lib/email-branding", () => ({
  getEmailBranding: async () => {
    calls.push("email.branding");
    return {
      storeName: "Test Store",
      from: "Test Store <hello@test.store>",
      fromAddress: "hello@test.store",
      replyTo: null,
      accentColor: "#000",
    };
  },
  emailLogoHtml: () => "",
}));
vi.mock("@/lib/emails/refund-issued", () => ({ refundIssuedHtml: () => "<p>refund</p>" }));
vi.mock("@/lib/emails/return-approved", () => ({ returnApprovedHtml: () => "" }));
vi.mock("@/lib/emails/return-rejected", () => ({ returnRejectedHtml: () => "" }));

import { POST } from "@/app/api/admin/returns/[id]/refund/route";
import { proxy } from "@/proxy";

const SESSION = { id: "admin_1", email: "a@test.store", name: "A", role: "ADMIN", tenantId: "tenant_a" };

function makeReturn(over: { total?: number; pi?: string | null; status?: string; stripeRefundId?: string | null } = {}) {
  return {
    id: "ret_1",
    status: over.status ?? "RECEIVED",
    stripeRefundId: over.stripeRefundId ?? null,
    refundAmount: null,
    order: {
      id: "ord_1",
      orderNumber: "AS-1001",
      email: "buyer@example.com",
      total: over.total ?? 5000,
      stripePaymentIntentId: over.pi === undefined ? "pi_123" : over.pi,
      financialStatus: "PAID",
    },
    items: [
      { id: "ri_1", quantity: 2, orderItem: { id: "oi_1", title: "Bowl", variantTitle: "Blue", variantId: "var_1" } },
      { id: "ri_2", quantity: 1, orderItem: { id: "oi_2", title: "Card", variantTitle: null, variantId: null } },
    ],
  };
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/returns/ret_1/refund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "ret_1" }) };

// What the conditional return.updateMany wrote; the in-tx findUnique reads it back.
let written: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  written = {};
  getAdminSession.mockResolvedValue(SESSION);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => {
    calls.push("tx.begin");
    const r = await fn(db);
    calls.push("tx.commit");
    return r;
  });
  db.return.findUnique.mockImplementation(async (a: { include?: unknown }) => {
    if (a.include) {
      calls.push("db.return.findUnique");
      return makeReturn();
    }
    calls.push("db.return.reload");
    return { id: "ret_1", ...written };
  });
  db.return.updateMany.mockImplementation(async (a: { data: Record<string, unknown> }) => {
    calls.push("db.return.updateMany");
    written = { status: a.data.status, refundAmount: a.data.refundAmount, stripeRefundId: a.data.stripeRefundId };
    return { count: 1 };
  });
  db.order.update.mockImplementation(async () => {
    calls.push("db.order.update");
    return {};
  });
  db.inventory.findMany.mockImplementation(async () => {
    calls.push("db.inventory.findMany");
    return [{ variantId: "var_1", quantity: 7 }];
  });
  db.productVariant.findMany.mockImplementation(async () => {
    calls.push("db.productVariant.findMany");
    return [{ id: "var_1" }];
  });
  db.inventory.upsert.mockImplementation(async () => {
    calls.push("db.inventory.upsert");
    return { id: "inv_1" };
  });
  db.inventoryLog.create.mockImplementation(async () => {
    calls.push("db.inventoryLog.create");
    return {};
  });
  refundCreate.mockImplementation(async () => {
    calls.push("stripe.refunds.create");
    return { id: "re_123" };
  });
  resendSend.mockImplementation(async () => {
    calls.push("email.send");
    return { data: { id: "email_1" } };
  });
  logEmail.mockImplementation(async () => {
    calls.push("email.log");
  });
});

describe("POST /api/admin/returns/[id]/refund", () => {
  it("retry after a lost DB write reuses the earlier Stripe refund (found by metadata) instead of refunding again", async () => {
    refundList.mockResolvedValueOnce({ data: [{ id: "re_earlier", amount: 5000, status: "succeeded", metadata: { returnId: "ret_1", orderId: "ord_1" } }] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({ amount: 5000, restock: false }), params);
    warn.mockRestore();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ stripeRefundId: "re_earlier", moneyMoved: true });
    expect(refundList).toHaveBeenCalledWith({ payment_intent: "pi_123", limit: 100 });
    expect(refundCreate).not.toHaveBeenCalled();
    expect(db.return.updateMany.mock.calls[0][0].data).toMatchObject({ stripeRefundId: "re_earlier" });
  });

  it("retry with a different amount than the unrecorded refund: 409 naming the issued amount, nothing written", async () => {
    refundList.mockResolvedValueOnce({ data: [{ id: "re_earlier", amount: 3000, status: "succeeded", metadata: { returnId: "ret_1" } }] });
    const res = await POST(req({ amount: 5000, restock: false }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ moneyMoved: true, stripeRefundId: "re_earlier", refundedAmount: 3000 });
    expect(refundCreate).not.toHaveBeenCalled();
    expect(db.return.updateMany).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("full refund with restock: 200, guard + plan -> Stripe (stable key) -> one tx (return, order, inventory + log) -> email", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({ amount: 5000, restock: true }), params);
    warn.mockRestore();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(["emailSent", "moneyMoved", "restocked", "return", "stripeRefundId", "warnings"]);
    expect(json.return).toEqual({ id: "ret_1", status: "REFUNDED", refundAmount: 5000, stripeRefundId: "re_123" });
    expect(json).toMatchObject({ stripeRefundId: "re_123", moneyMoved: true, emailSent: true });
    expect(json.restocked).toEqual([
      expect.objectContaining({ variantId: "var_1", increment: 2, currentQuantity: 7, newQuantity: 9, action: "increment" }),
    ]);
    // The variant-less line is skipped with a warning, not silently.
    expect(json.warnings).toHaveLength(1);
    expect(json.warnings[0]).toMatch(/Not restocked: "Card" has no product variant/);

    expect(calls.slice(0, 3)).toEqual(["db.return.findUnique", expect.any(String), expect.any(String)]);
    expect(calls.slice(1, 3).sort()).toEqual(["db.inventory.findMany", "db.productVariant.findMany"]);
    expect(calls.slice(3)).toEqual([
      "stripe.refunds.create",
      "tx.begin",
      "db.return.updateMany",
      "db.order.update",
      "db.inventory.upsert",
      "db.inventoryLog.create",
      "db.return.reload",
      "tx.commit",
      "email.branding",
      "email.send",
      "email.log",
    ]);

    expect(piRetrieve).not.toHaveBeenCalled();
    expect(refundCreate).toHaveBeenCalledWith(
      { payment_intent: "pi_123", amount: 5000, metadata: { returnId: "ret_1", orderId: "ord_1" } },
      { idempotencyKey: "return_refund_ret_1" },
    );

    const retUpd = db.return.updateMany.mock.calls[0][0];
    expect(retUpd.where).toEqual({ id: "ret_1", status: { not: "REFUNDED" } });
    expect(retUpd.data).toMatchObject({ status: "REFUNDED", refundAmount: 5000, stripeRefundId: "re_123", restockItems: true });
    expect(retUpd.data.resolvedAt).toBeInstanceOf(Date);
    expect(db.return.update).not.toHaveBeenCalled();
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: { financialStatus: "REFUNDED", status: "REFUNDED" },
    });
    // Only the line with a variant is restocked, with a matching log row.
    expect(db.inventory.update).not.toHaveBeenCalled();
    expect(db.inventory.upsert).toHaveBeenCalledTimes(1);
    expect(db.inventory.upsert).toHaveBeenCalledWith({
      where: { variantId: "var_1" },
      update: { quantity: { increment: 2 } },
      create: { tenantId: "tenant_a", variantId: "var_1", quantity: 2 },
    });
    expect(db.inventoryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "tenant_a", inventoryId: "inv_1", delta: 2, reason: "Return restock" }),
    });

    expect(resendSend).toHaveBeenCalledWith(expect.objectContaining({
      to: "buyer@example.com",
      replyTo: "hello@test.store",
      subject: "Your refund has been issued — Test Store",
    }));
    expect(logEmail).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant_a",
      type: "REFUND_ISSUED",
      resendId: "email_1",
      relatedId: "ret_1",
      relatedType: "RETURN",
    }));
  });

  it("restock creates the inventory row when the variant has none, and notes it in the log", async () => {
    db.inventory.findMany.mockResolvedValueOnce([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({ amount: 5000, restock: true }), params);
    warn.mockRestore();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.restocked).toEqual([
      expect.objectContaining({ variantId: "var_1", currentQuantity: null, newQuantity: 2, action: "create_inventory" }),
    ]);
    expect(db.inventory.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { tenantId: "tenant_a", variantId: "var_1", quantity: 2 },
    }));
    expect(db.inventoryLog.create.mock.calls[0][0].data.note).toMatch(/inventory record created/);
  });

  it("restock skips a deleted variant with a warning instead of failing after the refund", async () => {
    db.productVariant.findMany.mockResolvedValueOnce([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({ amount: 5000, restock: true }), params);
    warn.mockRestore();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.restocked).toEqual([]);
    expect(json.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/variant var_1 was deleted/)]));
    expect(db.inventory.upsert).not.toHaveBeenCalled();
    expect(refundCreate).toHaveBeenCalledTimes(1);
  });

  it("partial refund without restock keeps order status and skips inventory", async () => {
    const res = await POST(req({ amount: 1000, restock: false }), params);
    expect(res.status).toBe(200);
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: { financialStatus: "PARTIALLY_REFUNDED" },
    });
    expect(db.inventory.findMany).not.toHaveBeenCalled();
    expect(db.inventory.upsert).not.toHaveBeenCalled();
    expect(calls).toEqual([
      "db.return.findUnique",
      "stripe.refunds.create",
      "tx.begin",
      "db.return.updateMany",
      "db.order.update",
      "db.return.reload",
      "tx.commit",
      "email.branding",
      "email.send",
      "email.log",
    ]);
    expect(await res.json()).toMatchObject({ restocked: [], warnings: [], moneyMoved: true });
  });

  it("amount 0 or no payment intent: no Stripe call, stripeRefundId null, moneyMoved false", async () => {
    const res = await POST(req({ amount: 0, restock: false }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ stripeRefundId: null, moneyMoved: false });
    expect(piRetrieve).not.toHaveBeenCalled();
    expect(refundCreate).not.toHaveBeenCalled();
    expect(db.return.updateMany.mock.calls[0][0].data.stripeRefundId).toBeNull();

    db.return.findUnique.mockResolvedValueOnce(makeReturn({ pi: null }));
    const res2 = await POST(req({ amount: 5000, restock: false }), params);
    expect(res2.status).toBe(200);
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("validation and not-found branches return errors with no side effects", async () => {
    for (const bad of [{ amount: -1 }, {}, { amount: 10.5 }, { amount: "100" }]) {
      const r = await POST(req({ ...bad, restock: false }), params);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "Invalid refund amount" });
    }
    expect(db.return.findUnique).not.toHaveBeenCalled();

    db.return.findUnique.mockResolvedValueOnce(null);
    let res = await POST(req({ amount: 100, restock: false }), params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Return not found" });

    res = await POST(req({ amount: 5001, restock: false }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Refund amount cannot exceed order total" });

    expect(piRetrieve).not.toHaveBeenCalled();
    expect(refundCreate).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.return.updateMany).not.toHaveBeenCalled();
    expect(db.order.update).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("409 before any Stripe call when the return is already REFUNDED or has a Stripe refund id", async () => {
    for (const over of [{ status: "REFUNDED" }, { stripeRefundId: "re_old" }]) {
      db.return.findUnique.mockResolvedValueOnce(makeReturn(over));
      const res = await POST(req({ amount: 1000, restock: true }), params);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("This return has already been refunded");
    }
    expect(refundCreate).not.toHaveBeenCalled();
    expect(db.inventory.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("concurrent request already recorded the refund: 409, no order/inventory writes, no email", async () => {
    db.return.updateMany.mockResolvedValueOnce({ count: 0 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({ amount: 5000, restock: true }), params);
    warn.mockRestore();
    expect(res.status).toBe(409);
    expect(db.order.update).not.toHaveBeenCalled();
    expect(db.inventory.upsert).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("Stripe failure: 502 moneyMoved:false, no DB writes, no email", async () => {
    refundCreate.mockRejectedValueOnce(new Error("card_declined"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({ amount: 5000, restock: true }), params);
    spy.mockRestore();
    warn.mockRestore();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Stripe refund failed, nothing was changed: card_declined", moneyMoved: false });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.return.updateMany).not.toHaveBeenCalled();
    expect(db.order.update).not.toHaveBeenCalled();
    expect(db.inventory.upsert).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("DB transaction failure after Stripe: 500 with moneyMoved:true and the refund id, no email", async () => {
    db.order.update.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ amount: 1000, restock: false }), params);
    spy.mockRestore();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toMatchObject({ moneyMoved: true, stripeRefundId: "re_123" });
    expect(json.error).toContain("re_123");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("email failure is reported (emailSent:false), not turned into a 500", async () => {
    resendSend.mockRejectedValueOnce(new Error("resend down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ amount: 1000, restock: false }), params);
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ emailSent: false, moneyMoved: true });
    expect(logEmail).not.toHaveBeenCalled();
  });

  describe("no session", () => {
    it("is rejected with 401 by the /api/admin proxy before reaching the route", async () => {
      const r = new NextRequest("http://localhost/api/admin/returns/ret_1/refund", {
        method: "POST",
        headers: { host: "localhost", "content-type": "application/json" },
        body: JSON.stringify({ amount: 5000, restock: true }),
      });
      const res = await proxy(r);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(piRetrieve).not.toHaveBeenCalled();
      expect(refundCreate).not.toHaveBeenCalled();
    });

    it("rejects an invalid session cookie with 401 at the proxy", async () => {
      const r = new NextRequest("http://localhost/api/admin/returns/ret_1/refund", {
        method: "POST",
        headers: { host: "localhost", cookie: "as-admin-session=not-a-jwt" },
      });
      const res = await proxy(r);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("route itself (proxy bypassed): 401, touches nothing and never calls Stripe", async () => {
      getAdminSession.mockResolvedValue(null);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(req({ amount: 5000, restock: true }), params);
      spy.mockRestore();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(db.return.findUnique).not.toHaveBeenCalled();
      expect(piRetrieve).not.toHaveBeenCalled();
      expect(refundCreate).not.toHaveBeenCalled();
      expect(db.return.updateMany).not.toHaveBeenCalled();
      expect(resendSend).not.toHaveBeenCalled();
    });
  });
});
