/**
 * Returns refund: POST /api/admin/returns/[id]/refund and MCP returns_refund.
 *
 * The headline bug: F.ret.received has a mug line whose variant has NO
 * inventory row. Refunding with restock:true used to refund in Stripe and then
 * throw while restocking. Here both paths must refund once, create the missing
 * inventory row, log every stock change, and report the outcome truthfully.
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { F, KEYS, HOUSE } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import { resendState, sentTo, stripeState } from "../helpers/fakes";
import * as refund from "@/app/api/admin/returns/[id]/refund/route";
import * as one from "@/app/api/admin/returns/[id]/route";
import * as inventory from "@/app/api/admin/inventory/route";

const H = (fn: unknown) => fn as never;
const RID = F.ret.received;
const KEY = `return_refund_${RID}`;
const FULL = 15500; // F.order.paidReturn total == pi_paid_return amount

let restoreTransaction: (() => void) | null = null;
afterEach(() => {
  restoreTransaction?.();
  restoreTransaction = null;
});

const refundCreates = () => stripeState.calls.filter((c) => c.method === "refunds.create");
// Stripe calls that move or release money (reads like refunds.list / retrieve are fine in a preview).
const stripeMoneyCalls = () => stripeState.calls.filter((c) => ["refunds.create", "paymentIntents.cancel", "paymentIntents.capture"].includes(c.method));

async function snapshot() {
  return {
    returns: await prisma.return.findMany({ orderBy: { id: "asc" } }),
    orders: await prisma.order.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, financialStatus: true } }),
    inventory: await prisma.inventory.findMany({ orderBy: { id: "asc" }, select: { id: true, variantId: true, quantity: true } }),
    invLogs: await prisma.inventoryLog.count(),
    emailLogs: await prisma.emailLog.count(),
    sent: resendState.sent.length,
    refunds: stripeState.refunds.length,
  };
}

function postRefund(id: string, body: unknown) {
  return call(H(refund.POST), "POST", `/api/admin/returns/${id}/refund`, { params: { id }, body });
}

async function getReturnViaRoute(id: string) {
  const r = await call(H(one.GET), "GET", `/api/admin/returns/${id}`, { params: { id } });
  expect(r.status).toBe(200);
  return r.body.return;
}

/** variantId → quantity, read through GET /api/admin/inventory. */
async function stockViaRoute(): Promise<Map<string, number>> {
  const r = await call(H(inventory.GET), "GET", "/api/admin/inventory", { query: { limit: "100" } });
  expect(r.status).toBe(200);
  return new Map(r.body.inventory.map((i: { variantId: string; quantity: number }) => [i.variantId, i.quantity]));
}

async function stockViaMcp(mcp: Mcp): Promise<Map<string, number>> {
  const r = await mcp.call("inventory_list", { limit: 100 });
  return new Map(r.inventory.map((i: { variantId: string; quantity: number }) => [i.variantId, i.quantity]));
}

async function restockLogs(variantId: string) {
  return prisma.inventoryLog.findMany({ where: { inventory: { variantId }, reason: "Return restock" } });
}

/**
 * Make the next DB transaction on the house tenant's client (the memoized one
 * both the route and MCP use) reject once, i.e. after Stripe succeeded.
 * Not vi.spyOn: the extended client is a Proxy whose own descriptor reports
 * value undefined, so spy restore would leave $transaction undefined.
 */
function failNextTransaction() {
  const db = getTenantPrisma(HOUSE) as unknown as { $transaction: unknown };
  const original = db.$transaction;
  const state = { calls: 0 };
  restoreTransaction = () => {
    db.$transaction = original;
  };
  db.$transaction = () => {
    state.calls++;
    restoreTransaction?.();
    return Promise.reject(new Error("simulated DB outage"));
  };
  return state;
}

async function withMcp<T>(key: string, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const mcp = await connectMcp(key);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}

/** Shared assertions for a full refund of F.ret.received with restock:true. */
async function expectFullRestockedRefund(stock: Map<string, number>) {
  // Stripe: exactly one refund, the full amount, keyed per return.
  expect(stripeState.refunds).toHaveLength(1);
  expect(stripeState.refunds[0]).toMatchObject({ amount: FULL, payment_intent: "pi_paid_return", metadata: { returnId: RID, orderId: F.order.paidReturn } });
  // Every create attempt (a failed one included) used the per-return key.
  expect(refundCreates().length).toBeGreaterThan(0);
  expect(new Set(refundCreates().map((c) => c.idempotencyKey))).toEqual(new Set([KEY]));
  // Inventory: mug row CREATED with the returned quantity, hammock incremented.
  expect(stock.get(F.variant.mug)).toBe(1);
  expect(stock.get(F.variant.hammockBlue)).toBe(11);
  const mugLogs = await restockLogs(F.variant.mug);
  expect(mugLogs).toHaveLength(1);
  expect(mugLogs[0]).toMatchObject({ tenantId: HOUSE, delta: 1 });
  expect(mugLogs[0].note).toContain(RID);
  expect(mugLogs[0].note).toContain("inventory record created");
  const hamLogs = await restockLogs(F.variant.hammockBlue);
  expect(hamLogs).toHaveLength(1);
  expect(hamLogs[0]).toMatchObject({ delta: 1, inventoryId: F.inventory.hammockBlue });
  expect(await prisma.inventory.findUnique({ where: { variantId: F.variant.mug } })).toMatchObject({ tenantId: HOUSE, quantity: 1 });
  // Customer emailed once, logged once.
  const mails = sentTo("ana@example.test");
  expect(mails).toHaveLength(1);
  expect(mails[0].subject).toContain("Your refund has been issued");
  const logs = await prisma.emailLog.findMany({ where: { relatedId: RID } });
  expect(logs.map((l) => l.type)).toEqual(["REFUND_ISSUED"]);
}

interface RestockLineOut { variantId: string; action: string; increment: number; currentQuantity: number | null; newQuantity: number | null }
interface RefundResultOut { return: unknown; stripeRefundId: string | null; moneyMoved: boolean; warnings: string[]; emailSent: boolean; restocked: RestockLineOut[] }

function expectRefundResult(result: RefundResultOut) {
  expect(result.return).toMatchObject({ id: RID, status: "REFUNDED", refundAmount: FULL, stripeRefundId: "re_test_1", restockItems: true });
  expect(result.stripeRefundId).toBe("re_test_1");
  expect(result.moneyMoved).toBe(true);
  expect(result.warnings).toEqual([]);
  expect(result.emailSent).toBe(true);
  const restocked = Object.fromEntries(result.restocked.map((l) => [l.variantId, l]));
  expect(restocked[F.variant.mug]).toMatchObject({ action: "create_inventory", increment: 1, currentQuantity: null, newQuantity: 1 });
  expect(restocked[F.variant.hammockBlue]).toMatchObject({ action: "increment", increment: 1, currentQuantity: 10, newQuantity: 11 });
}

// ── route ───────────────────────────────────────────────────────────────────

describe("POST /api/admin/returns/[id]/refund", () => {
  it("no session → 401, nothing happens", async () => {
    const before = await snapshot();
    const r = await postRefund(RID, { amount: FULL, restock: true });
    expect(r.status).toBe(401);
    expect(await snapshot()).toEqual(before);
    expect(stripeState.calls).toHaveLength(0);
  });

  it("KEY BUG: full refund + restock with a variant that has no inventory row", async () => {
    await signInAs(F.admin.super);
    const r = await postRefund(RID, { amount: FULL, restock: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expectRefundResult(r.body);

    const ret = await getReturnViaRoute(RID);
    expect(ret).toMatchObject({ status: "REFUNDED", refundAmount: FULL, stripeRefundId: "re_test_1", restockItems: true });
    expect(ret.resolvedAt).toBeTruthy();
    expect(ret.order).toMatchObject({ financialStatus: "REFUNDED", status: "REFUNDED" });
    await expectFullRestockedRefund(await stockViaRoute());
  });

  it("partial refund without restock: PARTIALLY_REFUNDED, order status kept, stock untouched", async () => {
    await signInAs(F.admin.super);
    const stockBefore = await stockViaRoute();
    const logsBefore = await prisma.inventoryLog.count();
    const r = await postRefund(RID, { amount: 5000, restock: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ moneyMoved: true, restocked: [], warnings: [], emailSent: true, return: { refundAmount: 5000, restockItems: false } });
    const ret = await getReturnViaRoute(RID);
    expect(ret.status).toBe("REFUNDED");
    expect(ret.order).toMatchObject({ financialStatus: "PARTIALLY_REFUNDED", status: "DELIVERED" });
    expect(stripeState.refunds.map((x) => x.amount)).toEqual([5000]);
    expect(await stockViaRoute()).toEqual(stockBefore);
    expect(await prisma.inventoryLog.count()).toBe(logsBefore);
  });

  it("an already-REFUNDED return is 409 with no Stripe call and no change", async () => {
    await signInAs(F.admin.super);
    const before = await snapshot();
    const r = await postRefund(F.ret.refunded, { amount: 2000, restock: true });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "This return has already been refunded", refundAmount: 2000, stripeRefundId: "re_seed_partial" });
    expect(stripeState.calls).toHaveLength(0);
    expect(await snapshot()).toEqual(before);
  });

  it("refunding the same return twice in a row: second is 409, one Stripe refund", async () => {
    await signInAs(F.admin.super);
    expect((await postRefund(RID, { amount: FULL, restock: true })).status).toBe(200);
    const callsAfterFirst = stripeState.calls.length;
    const again = await postRefund(RID, { amount: FULL, restock: true });
    expect(again.status).toBe(409);
    expect(stripeState.calls.length).toBe(callsAfterFirst);
    await expectFullRestockedRefund(await stockViaRoute());
  });

  it("double submit (concurrent): one Stripe refund, one restock, one email", async () => {
    await signInAs(F.admin.super);
    const [a, b] = await Promise.all([postRefund(RID, { amount: FULL, restock: true }), postRefund(RID, { amount: FULL, restock: true })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await getReturnViaRoute(RID)).status).toBe("REFUNDED");
    await expectFullRestockedRefund(await stockViaRoute());
  });

  it("Stripe failure → 502, moneyMoved:false, nothing changed; a retry then succeeds", async () => {
    await signInAs(F.admin.super);
    const before = await snapshot();
    stripeState.failNext.set("refunds.create", "card network down");
    const r = await postRefund(RID, { amount: FULL, restock: true });
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ moneyMoved: false });
    expect(r.body.error).toContain("card network down");
    expect(await snapshot()).toEqual(before);
    expect((await getReturnViaRoute(RID)).status).toBe("RECEIVED");

    const retry = await postRefund(RID, { amount: FULL, restock: true });
    expect(retry.status).toBe(200);
    await expectFullRestockedRefund(await stockViaRoute());
  });

  it("DB failure after Stripe → 500 moneyMoved:true; retry records it WITHOUT a second refund", async () => {
    await signInAs(F.admin.super);
    const failed = failNextTransaction();
    const stockBefore = await stockViaRoute();
    const r = await postRefund(RID, { amount: FULL, restock: true });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ moneyMoved: true, stripeRefundId: "re_test_1" });
    expect(failed.calls).toBe(1);
    // Money moved, but nothing recorded and no email sent.
    const mid = await getReturnViaRoute(RID);
    expect(mid).toMatchObject({ status: "RECEIVED", stripeRefundId: null });
    expect(mid.order.financialStatus).toBe("PAID");
    expect(await stockViaRoute()).toEqual(stockBefore);
    expect(resendState.sent).toHaveLength(0);
    expect(stripeState.refunds).toHaveLength(1);

    const retry = await postRefund(RID, { amount: FULL, restock: true });
    expect(retry.status, JSON.stringify(retry.body)).toBe(200);
    expectRefundResult(retry.body);
    expect(refundCreates()).toHaveLength(1); // reconciled via refunds.list, not re-created
    expect(stripeState.calls.filter((c) => c.method === "refunds.list").length).toBe(2);
    expect((await getReturnViaRoute(RID)).order.financialStatus).toBe("REFUNDED");
    await expectFullRestockedRefund(await stockViaRoute());
  });

  it("DB failure then a retry with a DIFFERENT amount is 409 telling the real amount; no second refund", async () => {
    await signInAs(F.admin.super);
    failNextTransaction();
    expect((await postRefund(RID, { amount: FULL, restock: false })).status).toBe(500);
    const r = await postRefund(RID, { amount: 5000, restock: false });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ moneyMoved: true, stripeRefundId: "re_test_1", refundedAmount: FULL });
    expect(stripeState.refunds).toHaveLength(1);
    expect((await getReturnViaRoute(RID)).status).toBe("RECEIVED");
  });

  it("a deleted variant is skipped with a warning; the rest is restocked", async () => {
    await signInAs(F.admin.super);
    await prisma.productVariant.delete({ where: { id: F.variant.mug } });
    const r = await postRefund(RID, { amount: FULL, restock: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.warnings).toHaveLength(1);
    expect(r.body.warnings[0]).toContain("Clay Mug");
    expect(r.body.restocked.map((l: { variantId: string }) => l.variantId)).toEqual([F.variant.hammockBlue]);
    expect(r.body.moneyMoved).toBe(true);
    const stock = await stockViaRoute();
    expect(stock.get(F.variant.hammockBlue)).toBe(11);
    expect(await prisma.inventory.count({ where: { variantId: F.variant.mug } })).toBe(0);
    expect((await getReturnViaRoute(RID)).status).toBe("REFUNDED");
  });

  it("amount 0 moves no money but records the return as refunded", async () => {
    await signInAs(F.admin.super);
    const r = await postRefund(RID, { amount: 0, restock: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ moneyMoved: false, stripeRefundId: null, return: { status: "REFUNDED", refundAmount: 0 } });
    expect(stripeState.calls).toHaveLength(0);
    expect((await getReturnViaRoute(RID)).status).toBe("REFUNDED");
  });

  it("an order with no payment intent moves no money", async () => {
    await signInAs(F.admin.super);
    await prisma.order.update({ where: { id: F.order.paidReturn }, data: { stripePaymentIntentId: null } });
    const r = await postRefund(RID, { amount: FULL, restock: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ moneyMoved: false, stripeRefundId: null });
    expect(stripeState.calls).toHaveLength(0);
    const ret = await getReturnViaRoute(RID);
    expect(ret).toMatchObject({ status: "REFUNDED", refundAmount: FULL });
    expect((await stockViaRoute()).get(F.variant.mug)).toBe(1);
  });

  it("invalid amounts are 400 and touch nothing", async () => {
    await signInAs(F.admin.super);
    const before = await snapshot();
    for (const amount of [FULL + 1, -1, 12.5, "100", null]) {
      const r = await postRefund(RID, { amount, restock: true });
      expect(r.status, `amount ${amount}`).toBe(400);
    }
    expect((await postRefund(RID, { amount: FULL + 1, restock: true })).body.error).toBe("Refund amount cannot exceed order total");
    expect(stripeState.calls).toHaveLength(0);
    expect(await snapshot()).toEqual(before);
  });

  it("charge balance too small (refunded elsewhere) → Stripe rejects → 502, nothing changed", async () => {
    await signInAs(F.admin.super);
    const charge = stripeState.charges.get("ch_paid_return")!;
    charge.amount_refunded = 10000;
    const before = await snapshot();
    const r = await postRefund(RID, { amount: FULL, restock: true });
    expect(r.status).toBe(502);
    expect(r.body.moneyMoved).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("email failure is reported (emailSent:false), never a 500", async () => {
    await signInAs(F.admin.super);
    resendState.failNext = "resend down";
    const r = await postRefund(RID, { amount: FULL, restock: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ emailSent: false, moneyMoved: true });
    expect(await prisma.emailLog.count({ where: { relatedId: RID } })).toBe(0);
    expect((await getReturnViaRoute(RID)).status).toBe("REFUNDED");
  });

  it("unknown / other-tenant id → 404, no Stripe call", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.ret.other]) {
      const r = await postRefund(id, { amount: 100, restock: false });
      expect(r.status).toBe(404);
    }
    expect(stripeState.calls).toHaveLength(0);
  });
});

// ── MCP ─────────────────────────────────────────────────────────────────────

describe("MCP returns_refund", () => {
  it("KEY BUG: preview (no side effects) → confirm → replay blocked → read back", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await snapshot();
      const args = { returnId: RID, amount: FULL, restock: true };
      const flow = await previewConfirmReplay(mcp, "returns_refund", args, async (pv) => {
        expect(pv.preview).toMatchObject({
          returnId: RID, orderNumber: "AS-1005", orderTotal: FULL, refundAmount: FULL,
          payment: { action: "stripe_refund", chargeId: "ch_paid_return", refundableBalance: FULL, refundAmount: FULL },
          returnUpdate: { currentStatus: "RECEIVED", newStatus: "REFUNDED" },
          orderUpdate: { currentFinancialStatus: "PAID", newFinancialStatus: "REFUNDED" },
          email: { to: "ana@example.test", type: "REFUND_ISSUED" },
        });
        const plan = Object.fromEntries((pv.preview.restock as RestockLineOut[]).map((l) => [l.variantId, l]));
        expect(plan[F.variant.mug]).toMatchObject({ action: "create_inventory", newQuantity: 1 });
        expect(plan[F.variant.hammockBlue]).toMatchObject({ action: "increment", currentQuantity: 10, newQuantity: 11 });
        expect(pv.preview.warnings).toBeUndefined();
        expect(stripeMoneyCalls()).toHaveLength(0);
        expect(await snapshot()).toEqual(before);
      });
      expectRefundResult(expectConfirmed(flow));
      expectReplayBlocked(flow);

      const got = (await mcp.call("returns_get", { returnId: RID })).return;
      expect(got).toMatchObject({ status: "REFUNDED", refundAmount: FULL, stripeRefundId: "re_test_1", order: { financialStatus: "REFUNDED", status: "REFUNDED" } });
      const order = await mcp.call("orders_get", { orderId: F.order.paidReturn });
      expect(order.order).toMatchObject({ financialStatus: "REFUNDED", status: "REFUNDED" });
      await expectFullRestockedRefund(await stockViaMcp(mcp));
    });
  });

  it("an already-REFUNDED return is blocked (409) at preview, no Stripe call", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await snapshot();
      const r = await mcp.call("returns_refund", { returnId: F.ret.refunded, amount: 2000, restock: false });
      expect(r).toMatchObject({ done: false, blocked: true, status: 409, stripeRefundId: "re_seed_partial" });
      expect(stripeState.calls).toHaveLength(0);
      expect(await snapshot()).toEqual(before);
    });
  });

  it("refunded by a human between preview and confirm → confirm blocked, one refund", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const args = { returnId: RID, amount: FULL, restock: true };
      const pv = await mcp.call("returns_refund", args);
      await signInAs(F.admin.super);
      expect((await postRefund(RID, args)).status).toBe(200);
      const confirmed = await mcp.call("returns_refund", { ...args, confirmToken: pv.confirmToken });
      expect(confirmed).toMatchObject({ done: false, blocked: true, status: 409 });
      await expectFullRestockedRefund(await stockViaMcp(mcp));
    });
  });

  it("Stripe failure on confirm → failed, moneyMoved:false, nothing changed; a new preview succeeds", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const args = { returnId: RID, amount: FULL, restock: true };
      const before = await snapshot();
      const pv = await mcp.call("returns_refund", args);
      stripeState.failNext.set("refunds.create", "card network down");
      const c = await mcp.call("returns_refund", { ...args, confirmToken: pv.confirmToken });
      expect(c).toMatchObject({ done: false, blocked: true, status: 502, moneyMoved: false, outcome: "failed" });
      expect(await snapshot()).toEqual(before);

      const flow = await previewConfirmReplay(mcp, "returns_refund", args);
      expectRefundResult(expectConfirmed(flow));
      await expectFullRestockedRefund(await stockViaMcp(mcp));
    });
  });

  it("DB failure after Stripe → failed with moneyMoved:true; a new preview+confirm records it without a second refund", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const args = { returnId: RID, amount: FULL, restock: true };
      const pv = await mcp.call("returns_refund", args);
      failNextTransaction();
      const c = await mcp.call("returns_refund", { ...args, confirmToken: pv.confirmToken });
      expect(c).toMatchObject({ done: false, blocked: true, status: 500, moneyMoved: true, stripeRefundId: "re_test_1", outcome: "failed" });
      expect((await mcp.call("returns_get", { returnId: RID })).return.status).toBe("RECEIVED");
      expect(stripeState.refunds).toHaveLength(1);

      // A retry with a different amount is refused with the real amount, before any money moves.
      expect(await mcp.call("returns_refund", { ...args, amount: 5000 })).toMatchObject({ blocked: true, status: 409, refundedAmount: FULL, moneyMoved: true });
      // The retry must not be blocked by the charge balance the first attempt already used.
      const flow = await previewConfirmReplay(mcp, "returns_refund", args, (p) => {
        expect(p.preview.payment).toMatchObject({ action: "record_existing_refund", stripeRefundId: "re_test_1", refundAmount: FULL });
      });
      expectRefundResult(expectConfirmed(flow));
      expectReplayBlocked(flow);
      expect(refundCreates()).toHaveLength(1);
      await expectFullRestockedRefund(await stockViaMcp(mcp));
    });
  });

  it("a deleted variant is previewed and confirmed with a warning", async () => {
    await prisma.productVariant.delete({ where: { id: F.variant.mug } });
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "returns_refund", { returnId: RID, amount: FULL, restock: true }, (p) => {
        expect(p.preview.warnings).toHaveLength(1);
        expect(p.preview.warnings[0]).toContain("Clay Mug");
      });
      const res = expectConfirmed(flow);
      expect(res.warnings).toHaveLength(1);
      expect(res.restocked.map((l: { variantId: string }) => l.variantId)).toEqual([F.variant.hammockBlue]);
      expect((await stockViaMcp(mcp)).get(F.variant.hammockBlue)).toBe(11);
    });
  });

  it("amount 0 and no-payment-intent move no money", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const zero = await previewConfirmReplay(mcp, "returns_refund", { returnId: RID, amount: 0, restock: false }, (p) => {
        expect(p.preview.payment).toMatchObject({ action: "none" });
      });
      expect(expectConfirmed(zero)).toMatchObject({ moneyMoved: false, stripeRefundId: null });
      expect(stripeState.calls).toHaveLength(0);
    });
  });

  it("no payment intent: preview says no money moves; confirm moves none", async () => {
    await prisma.order.update({ where: { id: F.order.paidReturn }, data: { stripePaymentIntentId: null } });
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "returns_refund", { returnId: RID, amount: FULL, restock: false }, (p) => {
        expect(p.preview.payment).toMatchObject({ action: "none" });
      });
      expect(expectConfirmed(flow)).toMatchObject({ moneyMoved: false });
      expect(stripeState.calls).toHaveLength(0);
      expect((await mcp.call("returns_get", { returnId: RID })).return.status).toBe("REFUNDED");
    });
  });

  it("amount > order total or > charge balance is blocked at preview; unknown id 404", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await snapshot();
      expect(await mcp.call("returns_refund", { returnId: RID, amount: FULL + 1, restock: false })).toMatchObject({ blocked: true, status: 400, reason: "Refund amount cannot exceed order total" });
      stripeState.charges.get("ch_paid_return")!.amount_refunded = 10000;
      expect(await mcp.call("returns_refund", { returnId: RID, amount: FULL, restock: false })).toMatchObject({ blocked: true, status: 400, alreadyRefunded: 10000 });
      expect(await mcp.call("returns_refund", { returnId: "nope", amount: 1, restock: false })).toMatchObject({ blocked: true, status: 404 });
      expect(await mcp.call("returns_refund", { returnId: F.ret.other, amount: 1, restock: false })).toMatchObject({ blocked: true, status: 404 });
      expect(stripeMoneyCalls()).toHaveLength(0);
      expect(await snapshot()).toEqual(before);
    });
  });
});
