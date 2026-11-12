/**
 * Cancel policy (decisions 1 + 2), through the admin route AND MCP:
 *   - money first: a failed refund/void cancels nothing and is retry-safe;
 *   - status change + restock in one transaction, only after the money step;
 *   - unpaid / zero-balance orders cancel without a Stripe call;
 *   - delivered / shipped / partly shipped orders are refused with the next step;
 *   - partly refunded, unshipped orders refund exactly the remaining balance.
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { F, KEYS, HOUSE } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import { stripeState, resendState } from "../helpers/fakes";
import * as cancelRoute from "@/app/api/admin/orders/[id]/cancel/route";
import * as refundRoute from "@/app/api/admin/orders/[id]/refund/route";
import * as returnsRoute from "@/app/api/admin/returns/route";

const cancel = (id: string, reason = "Customer asked") => call(cancelRoute.POST as never, "POST", `/api/admin/orders/${id}/cancel`, { params: { id }, body: { reason } });
const refund = (id: string, body: unknown) => call(refundRoute.POST as never, "POST", `/api/admin/orders/${id}/refund`, { params: { id }, body });
const createReturn = (body: unknown) => call(returnsRoute.POST as never, "POST", "/api/admin/returns", { body });
const orderRow = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
const stock = async (id: string) => (await prisma.inventory.findUniqueOrThrow({ where: { id } })).quantity;
const moneyCalls = () => stripeState.calls.filter((c) => ["refunds.create", "paymentIntents.cancel", "paymentIntents.capture"].includes(c.method));

async function withMcp<T>(key: string, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const mcp = await connectMcp(key);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}

let restoreTransaction: (() => void) | null = null;
afterEach(() => {
  restoreTransaction?.();
  restoreTransaction = null;
});
/** The next $transaction on the house client rejects (a DB outage after Stripe). */
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

/**
 * A PROCESSING, PARTIALLY_REFUNDED order that hasn't shipped: 2 blue hammocks
 * (6000 each) + 1 mug (3500) = 15500 charged, 3000 already refunded.
 */
const PR = { id: "h_order_pr", pi: "pi_pr", blue: "h_oi_pr_blue", mug: "h_oi_pr_mug" };
async function seedPartlyRefunded(opts: { refunded?: number } = {}) {
  const refunded = opts.refunded ?? 3000;
  await prisma.order.create({
    data: {
      id: PR.id, tenantId: HOUSE, orderNumber: "AS-1101", customerId: F.cust.ana, email: "ana@example.test",
      status: "PROCESSING", financialStatus: "PARTIALLY_REFUNDED", shippingAddress: {}, subtotal: 15500, total: 15500,
      stripePaymentIntentId: PR.pi,
      items: {
        create: [
          { id: PR.blue, tenantId: HOUSE, productId: F.prod.hammock, variantId: F.variant.hammockBlue, title: "Woven Hammock", variantTitle: "Blue", quantity: 2, price: 6000, total: 12000, productSnapshot: {} },
          { id: PR.mug, tenantId: HOUSE, productId: F.prod.mug, variantId: F.variant.mug, title: "Clay Mug", quantity: 1, price: 3500, total: 3500, productSnapshot: {} },
        ],
      },
    },
  });
  stripeState.pis.set(PR.pi, { id: PR.pi, object: "payment_intent", amount: 15500, status: "succeeded", latest_charge: "ch_pr" });
  stripeState.charges.set("ch_pr", { id: "ch_pr", object: "charge", amount: 15500, amount_refunded: refunded, refunded: refunded >= 15500, payment_intent: PR.pi });
}

/** A PAID order with one shipped and one unshipped line. */
const PS = { id: "h_order_ps", shipped: "h_oi_ps_shipped", open: "h_oi_ps_open" };
async function seedPartlyShipped() {
  await prisma.order.create({
    data: {
      id: PS.id, tenantId: HOUSE, orderNumber: "AS-1102", customerId: F.cust.ana, email: "ana@example.test",
      status: "PROCESSING", financialStatus: "PAID", shippingAddress: {}, subtotal: 15500, total: 15500, stripePaymentIntentId: "pi_paid_return",
      items: {
        create: [
          { id: PS.shipped, tenantId: HOUSE, productId: F.prod.hammock, variantId: F.variant.hammockBlue, title: "Woven Hammock", quantity: 1, price: 12000, total: 12000, productSnapshot: {}, fulfillmentStatus: "fulfilled" },
          { id: PS.open, tenantId: HOUSE, productId: F.prod.mug, variantId: F.variant.mug, title: "Clay Mug", quantity: 1, price: 3500, total: 3500, productSnapshot: {} },
        ],
      },
    },
  });
}

// ── decision 2: delivered / shipped / partly shipped are refused ────────────

describe("cancel refuses orders that shipped, and says what to do instead", () => {
  it("DELIVERED: route 409 naming returns_create + the order page; nothing changes; no Stripe", async () => {
    await signInAs(F.admin.super);
    const before = await orderRow(F.order.delivered);
    const r = await cancel(F.order.delivered);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Order AS-1009 was delivered, so it can't be cancelled\. Create a return instead: use the returns_create tool, or the "Create return" button on the order page \(Admin → Orders → AS-1009\)/);
    expect(r.body.nextAction).toEqual({ tool: "returns_create", adminPage: `/admin/orders/${F.order.delivered}` });
    expect(await orderRow(F.order.delivered)).toEqual(before);
    expect(stripeState.calls).toHaveLength(0);
    expect(resendState.sent).toHaveLength(0);
  });

  it("fully SHIPPED and FULFILLED orders are refused the same way", async () => {
    await signInAs(F.admin.super);
    for (const [id, n] of [[F.order.shipped, "AS-1008"], [F.order.fulfilled, "AS-1007"]] as const) {
      const r = await cancel(id);
      expect(r.status).toBe(409);
      expect(r.body.error).toContain(`Order ${n} has already shipped`);
      expect(r.body.error).toContain("returns_create");
    }
    expect(moneyCalls()).toHaveLength(0);
  });

  it("partly shipped: refused, pointing to a return for the shipped items and orders_refund for the rest (with the amount)", async () => {
    await seedPartlyShipped();
    await signInAs(F.admin.super);
    const r = await cancel(PS.id);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/AS-1102 is partly shipped \(1× Woven Hammock\).*returns_create.*orders_refund.*3500 cents/);
    expect(r.body).toMatchObject({
      shippedItems: [{ orderItemId: PS.shipped, quantity: 1 }],
      unshippedItems: [{ orderItemId: PS.open, quantity: 1, total: 3500 }],
      unshippedValue: 3500,
      nextAction: { tools: ["returns_create", "orders_refund"] },
    });
    expect(moneyCalls()).toHaveLength(0);
    expect((await orderRow(PS.id)).status).toBe("PROCESSING");
  });

  it("MCP: the same refusals at preview (no confirm token issued)", async () => {
    await seedPartlyShipped();
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const d = await mcp.call("orders_cancel", { orderId: F.order.delivered, reason: "x" });
      expect(d).toMatchObject({ done: false, blocked: true, status: 409, nextAction: { tool: "returns_create" } });
      expect(d.reason).toContain("returns_create");
      expect(d.confirmToken).toBeUndefined();
      const p = await mcp.call("orders_cancel", { orderId: PS.id, reason: "x" });
      expect(p).toMatchObject({ blocked: true, status: 409, unshippedValue: 3500 });
      expect(p.reason).toContain("orders_refund");
    });
    expect(moneyCalls()).toHaveLength(0);
  });

  it("the named next step works: returns_create (route + MCP) on the delivered order, then returns_refund", async () => {
    await signInAs(F.admin.super);
    // The seeded REQUESTED return already covers the one delivered hammock.
    const dup = await createReturn({ orderId: F.order.delivered, items: [{ orderItemId: F.orderItem.deliveredHammock, quantity: 1 }] });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/Only 0 of "Woven Hammock" can still be returned \(1 already in another return\)/);
    await prisma.return.update({ where: { id: F.ret.requested }, data: { status: "REJECTED" } });

    const r = await createReturn({ orderId: F.order.delivered, items: [{ orderItemId: F.orderItem.deliveredHammock, quantity: 1, reason: "DEFECTIVE" }], notifyCustomer: true });
    expect(r.status, r.text).toBe(201);
    expect(r.body.return).toMatchObject({ status: "APPROVED", orderId: F.order.delivered, items: [{ orderItemId: F.orderItem.deliveredHammock, quantity: 1, reason: "DEFECTIVE" }] });
    expect(r.body.emailSent).toBe(true);
    expect(await prisma.emailLog.count({ where: { relatedId: r.body.return.id, type: "RETURN_APPROVED" } })).toBe(1);
    expect(moneyCalls()).toHaveLength(0);

    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "returns_refund", { returnId: r.body.return.id, amount: 12000, restock: true });
      expect(expectConfirmed(flow)).toMatchObject({ moneyMoved: true });
      expectReplayBlocked(flow);
    });
    expect(stripeState.refunds).toEqual([expect.objectContaining({ amount: 12000, payment_intent: "pi_delivered" })]);
  });

  it("returns_create via MCP: preview → confirm → replay; unshipped items refused with orders_refund", async () => {
    await seedPartlyShipped();
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const unshipped = await mcp.call("returns_create", { orderId: PS.id, items: [{ orderItemId: PS.open, quantity: 1 }] });
      expect(unshipped).toMatchObject({ blocked: true, status: 409 });
      expect(unshipped.reason).toContain("orders_refund");
      const before = await prisma.return.count();
      const flow = await previewConfirmReplay(mcp, "returns_create", { orderId: PS.id, items: [{ orderItemId: PS.shipped, quantity: 1 }] }, async (pv) => {
        expect(pv.preview).toMatchObject({ orderNumber: "AS-1102", newStatus: "APPROVED", itemsValue: 12000, email: null, moneyMoved: false });
        expect(await prisma.return.count()).toBe(before);
      });
      expect(expectConfirmed(flow).return).toMatchObject({ status: "APPROVED" });
      expectReplayBlocked(flow);
      expect(await prisma.return.count()).toBe(before + 1);
      // A second return for the same item is refused (quantity already covered).
      expect(await mcp.call("returns_create", { orderId: PS.id, items: [{ orderItemId: PS.shipped, quantity: 1 }] })).toMatchObject({ blocked: true, status: 409 });
    });
  });

  it("concurrent returns_create for the same item: exactly one return", async () => {
    await seedPartlyShipped();
    await signInAs(F.admin.super);
    const body = { orderId: PS.id, items: [{ orderItemId: PS.shipped, quantity: 1 }] };
    const rs = await Promise.all([createReturn(body), createReturn(body), createReturn(body)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.returnItem.count({ where: { orderItemId: PS.shipped } })).toBe(1);
  });
});

// ── decision 2: partly refunded, not shipped → refund the remaining balance ──

describe("partly refunded, unshipped order: cancel refunds exactly the remaining balance", () => {
  it("route: 15500 charged − 3000 refunded = 12500 refunded; blue hammocks restocked (+2); mug skipped (no inventory row)", async () => {
    await seedPartlyRefunded();
    await signInAs(F.admin.super);
    const r = await cancel(PR.id);
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ refunded: true, refundedAmount: 12500, order: { status: "CANCELLED", financialStatus: "REFUNDED" } });
    expect(stripeState.refunds).toEqual([expect.objectContaining({ amount: 12500, payment_intent: PR.pi, metadata: { orderId: PR.id, cancel: "true" } })]);
    expect(stripeState.charges.get("ch_pr")).toMatchObject({ amount_refunded: 15500, refunded: true });
    expect(await stock(F.inventory.hammockBlue)).toBe(12);
    expect(await prisma.inventory.count({ where: { variantId: F.variant.mug } })).toBe(0);
    expect(r.body.restocked).toEqual([{ title: "Woven Hammock", variantTitle: "Blue", quantity: 2, newQuantity: 12 }]);
    // The email states the amount actually refunded, not the order total.
    expect(resendState.sent[0].html).toContain("$125.00");
  });

  it("MCP preview shows the exact amount and the restock lines; confirm matches it", async () => {
    await seedPartlyRefunded({ refunded: 4321 });
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "orders_cancel", { orderId: PR.id, reason: "Out of stock" }, (pv) => {
        expect(pv.preview).toMatchObject({
          currentFinancialStatus: "PARTIALLY_REFUNDED",
          expectedFinancialStatus: "REFUNDED",
          refundAmount: 11179,
          refundAmountFormatted: "$111.79",
          payment: { action: "stripe_refund", amount: 11179, chargedAmount: 15500, alreadyRefunded: 4321 },
        });
        expect(pv.preview.paymentAction).toMatch(/Refund the remaining 11179 cents \(\$111\.79\).*already refunded 4321/);
        expect(pv.preview.restock).toEqual([
          expect.objectContaining({ orderItemId: PR.blue, quantity: 2, currentQuantity: 10, newQuantity: 12, action: "increment" }),
          expect.objectContaining({ orderItemId: PR.mug, quantity: 0, action: "skip", note: expect.stringContaining("No inventory record") }),
        ]);
        expect(moneyCalls()).toHaveLength(0);
      });
      expect(expectConfirmed(flow)).toMatchObject({ refundedAmount: 11179 });
      expectReplayBlocked(flow);
    });
    expect(stripeState.refunds.map((x) => x.amount)).toEqual([11179]);
    expect(await stock(F.inventory.hammockBlue)).toBe(12);
  });

  it("an item already restocked by a refunded return is not restocked twice", async () => {
    await seedPartlyRefunded();
    await prisma.return.create({
      data: { id: "h_ret_pr", tenantId: HOUSE, orderId: PR.id, status: "REFUNDED", refundAmount: 3000, restockItems: true, items: { create: [{ tenantId: HOUSE, orderItemId: PR.blue, quantity: 1, reason: "OTHER" }] } },
    });
    await signInAs(F.admin.super);
    const r = await cancel(PR.id);
    expect(r.status).toBe(200);
    expect(r.body.restocked).toEqual([expect.objectContaining({ quantity: 1, newQuantity: 11 })]);
    expect(await stock(F.inventory.hammockBlue)).toBe(11);
  });

  it("charge already fully refunded in Stripe: cancels without a new refund", async () => {
    await seedPartlyRefunded({ refunded: 15500 });
    await signInAs(F.admin.super);
    const r = await cancel(PR.id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ refundedAmount: 0, order: { status: "CANCELLED", financialStatus: "REFUNDED" } });
    expect(moneyCalls()).toHaveLength(0);
  });
});

// ── decision 1: unpaid / zero balance; money-first; retries ──────────────────

describe("unpaid and zero-balance orders cancel without moving money", () => {
  it("no payment intent, total 0: cancelled + restocked with no Stripe call at all", async () => {
    await prisma.order.create({
      data: {
        id: "h_order_free", tenantId: HOUSE, orderNumber: "AS-1103", email: "ben@example.test", status: "PROCESSING", financialStatus: "PAID",
        shippingAddress: {}, subtotal: 0, total: 0,
        items: { create: [{ tenantId: HOUSE, productId: F.prod.hammock, variantId: F.variant.hammockBlue, title: "Woven Hammock", quantity: 1, price: 0, total: 0, productSnapshot: {} }] },
      },
    });
    await signInAs(F.admin.super);
    const r = await cancel("h_order_free");
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ refunded: false, refundedAmount: 0, order: { status: "CANCELLED", financialStatus: "PAID" } });
    expect(stripeState.calls).toHaveLength(0);
    expect(await stock(F.inventory.hammockBlue)).toBe(11);
  });

  it("hosted-checkout orders (stock never taken) are not restocked", async () => {
    await prisma.order.update({ where: { id: F.order.paidCancel }, data: { stripeCheckoutSessionId: "cs_test_1" } });
    await signInAs(F.admin.super);
    const r = await cancel(F.order.paidCancel);
    expect(r.status).toBe(200);
    expect(r.body.restocked).toEqual([]);
    expect(await stock(F.inventory.hammockRed)).toBe(2);
  });

  it("unpaid (PENDING) order whose Stripe release fails is still cancelled (no money held); paymentError says so", async () => {
    await signInAs(F.admin.super);
    stripeState.failNext.set("paymentIntents.cancel", "stripe down");
    const r = await cancel(F.order.pending);
    expect(r.status).toBe(200);
    expect(r.body.paymentError).toMatch(/order is cancelled, but releasing its unpaid Stripe payment failed: stripe down\. No money was taken/);
    expect(await orderRow(F.order.pending)).toMatchObject({ status: "CANCELLED" });
  });
});

describe("money first: failures cancel nothing, and retrying is safe", () => {
  it("MCP: refund failure → {done:false, blocked:true, reason, retrySafe:true}; order untouched; a new preview + confirm finishes with one refund", async () => {
    stripeState.cacheFailures = true;
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const args = { orderId: F.order.paidCancel, reason: "Out of stock" };
      const p = await mcp.call("orders_cancel", args);
      stripeState.failNext.set("refunds.create", "card network down");
      const c = await mcp.call("orders_cancel", { ...args, confirmToken: p.confirmToken });
      expect(c).toMatchObject({ done: false, blocked: true, retrySafe: true, moneyMoved: false, outcome: "failed" });
      expect(c.reason).toContain("was NOT cancelled");
      expect(c.retry).toMatch(/Safe to retry/);
      expect((await mcp.call("orders_get", { orderId: F.order.paidCancel })).order).toMatchObject({ status: "PROCESSING", financialStatus: "PAID" });
      expect(await stock(F.inventory.hammockRed)).toBe(2);

      const flow = await previewConfirmReplay(mcp, "orders_cancel", args);
      expect(expectConfirmed(flow)).toMatchObject({ refunded: true, refundedAmount: 12000 });
      expectReplayBlocked(flow);
    });
    expect(stripeState.refunds).toHaveLength(1);
    expect(await stock(F.inventory.hammockRed)).toBe(3);
  });

  it("DB failure after the refund → 500 moneyMoved + retrySafe; nothing restocked; the retry reuses that refund (no second refund)", async () => {
    await signInAs(F.admin.super);
    const failed = failNextTransaction();
    const r = await cancel(F.order.paidCancel);
    expect(failed.calls).toBe(1);
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ moneyMoved: true, retrySafe: true, refundId: "re_test_1" });
    expect(await orderRow(F.order.paidCancel)).toMatchObject({ status: "PROCESSING", financialStatus: "PAID" });
    expect(await stock(F.inventory.hammockRed)).toBe(2);
    expect(resendState.sent).toHaveLength(0);

    const retry = await cancel(F.order.paidCancel);
    expect(retry.status, retry.text).toBe(200);
    expect(retry.body).toMatchObject({ refunded: true, refundedAmount: 12000, stripeRefundId: "re_test_1" });
    expect(stripeState.calls.filter((c) => c.method === "refunds.create")).toHaveLength(1);
    expect(stripeState.refunds).toHaveLength(1);
    expect(await stock(F.inventory.hammockRed)).toBe(3);
  });

  it("MCP preview of a retry after a recorded-nothing refund says no new money moves", async () => {
    await signInAs(F.admin.super);
    failNextTransaction();
    expect((await cancel(F.order.paidCancel)).status).toBe(500);
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const p = await mcp.call("orders_cancel", { orderId: F.order.paidCancel, reason: "x" });
      expect(p.preview).toMatchObject({ refundAmount: 12000, payment: { action: "record_existing_refund", stripeRefundId: "re_test_1" } });
      expect(p.preview.paymentAction).toMatch(/No new money moves/);
    });
  });

  it("concurrent: 5 cancels at once → one refund, one restock, one email", async () => {
    await signInAs(F.admin.super);
    const rs = await Promise.all(Array.from({ length: 5 }, () => cancel(F.order.paidCancel)));
    const statuses = rs.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s !== 200).every((s) => s === 400 || s === 409)).toBe(true);
    expect(stripeState.refunds).toHaveLength(1);
    expect(stripeState.charges.get("ch_paid_cancel")!.amount_refunded).toBe(12000);
    expect(await stock(F.inventory.hammockRed)).toBe(3);
    expect(await prisma.inventoryLog.count({ where: { inventoryId: F.inventory.hammockRed, reason: "Order cancelled" } })).toBe(1);
    expect(resendState.sent).toHaveLength(1);
  });

  it("concurrent cancel + partial refund: never more than the charge, and a refused cancel leaves the order uncancelled", async () => {
    await signInAs(F.admin.super);
    const [c, rf] = await Promise.all([cancel(F.order.paidCancel), refund(F.order.paidCancel, { amount: 2000 })]);
    const charge = stripeState.charges.get("ch_paid_cancel")!;
    expect(charge.amount_refunded).toBeLessThanOrEqual(12000);
    const total = stripeState.refunds.reduce((sum, x) => sum + x.amount, 0);
    expect(total).toBe(charge.amount_refunded);
    const o = await orderRow(F.order.paidCancel);
    if (c.status === 200) {
      expect(o.status).toBe("CANCELLED");
      expect(await stock(F.inventory.hammockRed)).toBe(3);
    } else {
      // The cancel lost the race (its refund was too big once the partial landed): nothing cancelled.
      expect([409, 502]).toContain(c.status);
      expect(o.status).not.toBe("CANCELLED");
      expect(await stock(F.inventory.hammockRed)).toBe(2);
    }
    expect([200, 400, 409, 502]).toContain(rf.status);
  });
});
