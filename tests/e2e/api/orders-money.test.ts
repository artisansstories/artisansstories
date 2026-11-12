/**
 * Orders domain, money paths: refund + cancel through the admin routes and the
 * MCP tools (orders_refund / orders_cancel), against the realistic Stripe fake.
 * Capture-on-fulfill is covered in orders.test.ts.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import { stripeState, resendState, sentTo, FakeStripe } from "../helpers/fakes";
import * as oneRoute from "@/app/api/admin/orders/[id]/route";
import * as cancelRoute from "@/app/api/admin/orders/[id]/cancel/route";
import * as refundRoute from "@/app/api/admin/orders/[id]/refund/route";

const GET_ORDER = async (id: string) => (await call(oneRoute.GET as never, "GET", `/api/admin/orders/${id}`, { params: { id } })).body.order;
const refund = (id: string, body: unknown) => call(refundRoute.POST as never, "POST", `/api/admin/orders/${id}/refund`, { params: { id }, body });
const cancel = (id: string, reason = "Out of stock") => call(cancelRoute.POST as never, "POST", `/api/admin/orders/${id}/cancel`, { params: { id }, body: { reason } });
const orderRow = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
const created = () => stripeState.calls.filter((c) => c.method === "refunds.create");
const moneyCalls = () => stripeState.calls.filter((c) => ["refunds.create", "paymentIntents.cancel", "paymentIntents.capture"].includes(c.method));

async function withMcp<T>(key: string, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const mcp = await connectMcp(key);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}

// ── refund: route ────────────────────────────────────────────────────────────

describe("POST /api/admin/orders/[id]/refund", () => {
  it("full refund of a PAID order: one Stripe refund, REFUNDED, note appended, customer emailed + logged", async () => {
    await signInAs(F.admin.super);
    const before = await orderRow(F.order.paid);
    const r = await refund(F.order.paid, { reason: "Damaged in transit" });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ success: true, amount: 12000, status: "succeeded", financialStatus: "REFUNDED", emailSent: true, alreadyRecorded: false });
    expect(r.body.refundId).toBe(stripeState.refunds[0].id);

    expect(stripeState.refunds).toHaveLength(1);
    expect(stripeState.refunds[0]).toMatchObject({ amount: 12000, payment_intent: "pi_paid", metadata: { orderId: F.order.paid, orderVersion: String(before.updatedAt.getTime()) } });
    expect(created()[0].idempotencyKey).toBe(`order_refund_${F.order.paid}_${before.updatedAt.getTime()}_full`);
    expect(stripeState.charges.get("ch_paid")!.refunded).toBe(true);

    const o = await GET_ORDER(F.order.paid);
    expect(o).toMatchObject({ status: "REFUNDED", financialStatus: "REFUNDED" });
    expect(o.adminNote).toMatch(/^Gift wrap requested\n\nRefund issued: Damaged in transit/);

    const mails = sentTo("ana@example.test");
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("Refund issued for order AS-1003");
    expect(mails[0].html).toContain("$120.00");
    const logs = await prisma.emailLog.findMany({ where: { relatedId: F.order.paid, type: "ORDER_REFUNDED" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ tenantId: HOUSE, toEmail: "ana@example.test" });
  });

  it("double submit, sequential: the second is refused by the status check before Stripe", async () => {
    await signInAs(F.admin.super);
    expect((await refund(F.order.paid, {})).status).toBe(200);
    const callsAfterFirst = stripeState.calls.length;
    const second = await refund(F.order.paid, {});
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/not in a refundable state/);
    expect(stripeState.calls).toHaveLength(callsAfterFirst); // no Stripe call at all
    expect(stripeState.refunds).toHaveLength(1);
    expect(resendState.sent).toHaveLength(1);
  });

  it("double submit, concurrent: one Stripe refund, recorded once, one email", async () => {
    await signInAs(F.admin.super);
    const rs = await Promise.all([refund(F.order.paid, {}), refund(F.order.paid, {})]);
    // One records the refund. The other either replays the same Stripe refund
    // and finds it already recorded (200, alreadyRecorded), or — if it reads the
    // order after the first committed — is refused as not refundable (400).
    const winner = rs.find((r) => r.status === 200 && r.body.alreadyRecorded === false)!;
    expect(winner).toBeDefined();
    const loser = rs.find((r) => r !== winner)!;
    if (loser.status === 200) {
      expect(loser.body).toMatchObject({ alreadyRecorded: true, refundId: winner.body.refundId });
    } else {
      expect(loser.status).toBe(400);
    }
    expect(stripeState.refunds).toHaveLength(1);
    expect(stripeState.charges.get("ch_paid")!.amount_refunded).toBe(12000);
    expect(resendState.sent).toHaveLength(1);
    expect(await prisma.emailLog.count({ where: { relatedId: F.order.paid, type: "ORDER_REFUNDED" } })).toBe(1);
    expect((await orderRow(F.order.paid)).adminNote!.match(/Refund issued/g)).toHaveLength(1);
  });

  it("partial refund keeps the order status, marks PARTIALLY_REFUNDED, key carries the amount", async () => {
    await signInAs(F.admin.super);
    const before = await orderRow(F.order.paid);
    const r = await refund(F.order.paid, { amount: 5000, reason: "Price adjustment" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ amount: 5000, financialStatus: "PARTIALLY_REFUNDED" });
    expect(created()[0].idempotencyKey).toBe(`order_refund_${F.order.paid}_${before.updatedAt.getTime()}_5000`);
    expect(await GET_ORDER(F.order.paid)).toMatchObject({ status: "PROCESSING", financialStatus: "PARTIALLY_REFUNDED" });
    expect(sentTo("ana@example.test")[0].html).toContain("$50.00");
  });

  it("final partial refund that empties the charge marks the order REFUNDED", async () => {
    await signInAs(F.admin.super);
    // AS-1006: $120 charge, $20 already refunded by a return.
    const r = await refund(F.order.partial, { amount: 10000 });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ amount: 10000, financialStatus: "REFUNDED" });
    expect(stripeState.charges.get("ch_partial")).toMatchObject({ amount_refunded: 12000, refunded: true });
    expect(await GET_ORDER(F.order.partial)).toMatchObject({ status: "REFUNDED", financialStatus: "REFUNDED" });
  });

  it("refund with no amount on a partially-refunded order refunds only the remaining balance", async () => {
    await signInAs(F.admin.super);
    const r = await refund(F.order.partial, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ amount: 10000, financialStatus: "REFUNDED" });
  });

  it("amount above the remaining balance: Stripe rejects, nothing changed, moneyMoved=false", async () => {
    await signInAs(F.admin.super);
    const before = await orderRow(F.order.partial);
    const r = await refund(F.order.partial, { amount: 11000 });
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ moneyMoved: false });
    expect(r.body.error).toMatch(/nothing was changed/);
    expect(stripeState.refunds).toHaveLength(0);
    expect(await orderRow(F.order.partial)).toEqual(before);
    expect(resendState.sent).toHaveLength(0);
  });

  it("invalid amounts are rejected before Stripe (never silently turned into a FULL refund)", async () => {
    await signInAs(F.admin.super);
    for (const amount of [0, -500, 12.5, "5000", "abc", true]) {
      const r = await refund(F.order.paid, { amount });
      expect(r.status, `amount ${JSON.stringify(amount)}: ${r.text}`).toBe(400);
    }
    expect(moneyCalls()).toHaveLength(0);
    expect(stripeState.refunds).toHaveLength(0);
    expect((await orderRow(F.order.paid)).financialStatus).toBe("PAID");
  });

  it("status checks happen before any Stripe call", async () => {
    await signInAs(F.admin.super);
    const cases: Array<[string, RegExp]> = [
      [F.order.authorized, /authorized but not yet captured/],
      [F.order.pending, /not in a refundable state/],
      [F.order.refunded, /not in a refundable state/],
      [F.order.cancelled, /not in a refundable state/],
    ];
    for (const [id, msg] of cases) {
      const before = await orderRow(id);
      const r = await refund(id, {});
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(msg);
      expect(await orderRow(id)).toEqual(before);
    }
    await prisma.order.update({ where: { id: F.order.paidCancel }, data: { stripePaymentIntentId: null } });
    const noPi = await refund(F.order.paidCancel, {});
    expect(noPi.status).toBe(400);
    expect(noPi.body.error).toMatch(/No Stripe payment/);
    expect(stripeState.calls).toHaveLength(0);
    expect(resendState.sent).toHaveLength(0);
  });

  it("Stripe failure: 502, moneyMoved=false, order unchanged, no email", async () => {
    await signInAs(F.admin.super);
    const before = await orderRow(F.order.paid);
    stripeState.failNext.set("refunds.create", "boom");
    const r = await refund(F.order.paid, {});
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ moneyMoved: false });
    expect(r.body.error).toContain("boom");
    expect(await orderRow(F.order.paid)).toEqual(before);
    expect(stripeState.refunds).toHaveLength(0);
    expect(resendState.sent).toHaveLength(0);
    // A retry afterwards works and refunds exactly once.
    const retry = await refund(F.order.paid, {});
    expect(retry.status).toBe(200);
    expect(stripeState.refunds).toHaveLength(1);
  });

  it("retry after a refund that reached Stripe but was never recorded reuses it (no second refund)", async () => {
    await signInAs(F.admin.super);
    const before = await orderRow(F.order.paid);
    // Simulate: the earlier attempt's Stripe refund succeeded, then the DB write was lost.
    await new FakeStripe().refunds.create({ payment_intent: "pi_paid", metadata: { orderId: F.order.paid, orderVersion: String(before.updatedAt.getTime()) } });
    stripeState.calls = [];
    const r = await refund(F.order.paid, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ refundId: "re_test_1", financialStatus: "REFUNDED", alreadyRecorded: false });
    expect(created()).toHaveLength(0);
    expect(stripeState.refunds).toHaveLength(1);
    expect((await orderRow(F.order.paid)).financialStatus).toBe("REFUNDED");
  });

  it("email failure is reported honestly (emailSent=false); the refund still stands", async () => {
    await signInAs(F.admin.super);
    resendState.failNext = "smtp down";
    const r = await refund(F.order.paid, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ financialStatus: "REFUNDED", emailSent: false });
    expect(await prisma.emailLog.count({ where: { relatedId: F.order.paid, type: "ORDER_REFUNDED" } })).toBe(0);
  });
});

// ── refund: MCP ──────────────────────────────────────────────────────────────

describe("MCP orders_refund", () => {
  it("preview → confirm → replay (full refund)", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await orderRow(F.order.paid);
      const flow = await previewConfirmReplay(mcp, "orders_refund", { orderId: F.order.paid, reason: "MCP refund" }, async (p) => {
        expect(p.preview).toMatchObject({
          orderNumber: "AS-1003", chargedAmount: 12000, alreadyRefunded: 0, refundAmount: 12000, refundAmountFormatted: "$120.00",
          refundType: "full", newFinancialStatus: "REFUNDED", newStatus: "REFUNDED", email: { to: "ana@example.test", type: "ORDER_REFUNDED" },
        });
        expect(await orderRow(F.order.paid)).toEqual(before);
        expect(moneyCalls()).toHaveLength(0);
        expect(resendState.sent).toHaveLength(0);
      });
      expect(expectConfirmed(flow)).toMatchObject({ success: true, amount: 12000, financialStatus: "REFUNDED", emailSent: true });
      expectReplayBlocked(flow);
      expect(stripeState.refunds).toHaveLength(1);
      expect(created()).toHaveLength(1);
      expect(resendState.sent).toHaveLength(1);
      const o = (await mcp.call("orders_get", { orderId: F.order.paid })).order;
      expect(o).toMatchObject({ status: "REFUNDED", financialStatus: "REFUNDED" });
      expect(o.adminNote).toContain("Refund issued: MCP refund");
    });
  });

  it("partial: preview shows what was already refunded; the final partial marks REFUNDED", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const tooMuch = await mcp.call("orders_refund", { orderId: F.order.partial, amount: 11000 });
      expect(tooMuch).toMatchObject({ blocked: true, status: 400 });
      expect(tooMuch.reason).toMatch(/exceeds the refundable balance of 10000/);
      const flow = await previewConfirmReplay(mcp, "orders_refund", { orderId: F.order.partial, amount: 10000 }, (p) => {
        expect(p.preview).toMatchObject({ alreadyRefunded: 2000, refundAmount: 10000, refundType: "full", newFinancialStatus: "REFUNDED" });
        expect(stripeState.refunds).toHaveLength(0);
      });
      expect(expectConfirmed(flow)).toMatchObject({ amount: 10000, financialStatus: "REFUNDED" });
      expectReplayBlocked(flow);
      expect(stripeState.refunds).toHaveLength(1);
      expect((await mcp.call("orders_get", { orderId: F.order.partial })).order).toMatchObject({ status: "REFUNDED", financialStatus: "REFUNDED" });
    });
  });

  it("blocks non-refundable orders at preview and refuses invalid amounts", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      expect(await mcp.call("orders_refund", { orderId: F.order.authorized })).toMatchObject({ blocked: true, status: 400 });
      expect(await mcp.call("orders_refund", { orderId: F.order.refunded })).toMatchObject({ blocked: true, status: 400 });
      for (const amount of [0, -1, 1.5]) {
        // Rejected by the tool's input schema before the handler runs.
        const r = await mcp.call("orders_refund", { orderId: F.order.paid, amount });
        expect(r.isError, JSON.stringify(r)).toBe(true);
        expect(r.__text).toMatch(/Input validation error.*amount/);
      }
      expect(moneyCalls()).toHaveLength(0);
    });
  });

  it("Stripe failure on confirm: failed outcome with moneyMoved=false, order unchanged", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await orderRow(F.order.paid);
      const p = await mcp.call("orders_refund", { orderId: F.order.paid });
      stripeState.failNext.set("refunds.create", "boom");
      const r = await mcp.call("orders_refund", { orderId: F.order.paid, confirmToken: p.confirmToken });
      expect(r).toMatchObject({ done: false, blocked: true, status: 502, moneyMoved: false, outcome: "failed" });
      expect(await orderRow(F.order.paid)).toEqual(before);
      expect(stripeState.refunds).toHaveLength(0);
      expect(resendState.sent).toHaveLength(0);
    });
  });

  it("route and MCP can't refund twice for one action", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const p = await mcp.call("orders_refund", { orderId: F.order.paid });
      await signInAs(F.admin.super);
      expect((await refund(F.order.paid, {})).status).toBe(200);
      // The MCP confirm recomputes the preview and sees the order is already refunded.
      const r = await mcp.call("orders_refund", { orderId: F.order.paid, confirmToken: p.confirmToken });
      expect(r).toMatchObject({ done: false, blocked: true, status: 400 });
      expect(stripeState.refunds).toHaveLength(1);
    });
  });
});

// ── cancel: route ────────────────────────────────────────────────────────────

describe("POST /api/admin/orders/[id]/cancel", () => {
  it("PAID order: full Stripe refund (key order_cancel_<id>_refund), CANCELLED/REFUNDED, refund-cancel email", async () => {
    await signInAs(F.admin.super);
    const r = await cancel(F.order.paidCancel, "Out of stock");
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ refunded: true, paymentError: null, emailSent: true });
    expect(r.body.order).toMatchObject({ status: "CANCELLED", financialStatus: "REFUNDED", cancelReason: "Out of stock" });
    expect(created()).toHaveLength(1);
    expect(created()[0].idempotencyKey).toBe(`order_cancel_${F.order.paidCancel}_refund`);
    expect(stripeState.refunds[0]).toMatchObject({ amount: 12000, payment_intent: "pi_paid_cancel", metadata: { orderId: F.order.paidCancel, cancel: "true" } });
    const o = await GET_ORDER(F.order.paidCancel);
    expect(o).toMatchObject({ status: "CANCELLED", financialStatus: "REFUNDED", cancelReason: "Out of stock" });
    expect(o.cancelledAt).toBeTruthy();
    const mails = sentTo("ana@example.test");
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("Your order AS-1004 has been cancelled");
    expect(mails[0].html).toContain("Out of stock");
    expect(await prisma.emailLog.count({ where: { relatedId: F.order.paidCancel, type: "ORDER_REFUNDED" } })).toBe(1);
  });

  it("AUTHORIZED order: voids the hold (key order_cancel_<id>_void), no refund, VOIDED", async () => {
    await signInAs(F.admin.super);
    const r = await cancel(F.order.authorized);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ refunded: false, paymentError: null, emailSent: true });
    const voids = stripeState.calls.filter((c) => c.method === "paymentIntents.cancel");
    expect(voids).toHaveLength(1);
    expect(voids[0].args[0]).toBe("pi_authorized");
    expect(voids[0].idempotencyKey).toBe(`order_cancel_${F.order.authorized}_void`);
    expect(created()).toHaveLength(0);
    expect(stripeState.pis.get("pi_authorized")!.status).toBe("canceled");
    expect(await GET_ORDER(F.order.authorized)).toMatchObject({ status: "CANCELLED", financialStatus: "VOIDED" });
    expect(await prisma.emailLog.count({ where: { relatedId: F.order.authorized, type: "ORDER_CANCELLED" } })).toBe(1);
  });

  it("PENDING (unpaid) order: releases the payment intent, VOIDED", async () => {
    await signInAs(F.admin.super);
    const r = await cancel(F.order.pending);
    expect(r.status).toBe(200);
    expect(stripeState.calls.filter((c) => c.method === "paymentIntents.cancel")[0].idempotencyKey).toBe(`order_cancel_${F.order.pending}_void`);
    expect(await GET_ORDER(F.order.pending)).toMatchObject({ status: "CANCELLED", financialStatus: "VOIDED" });
    expect(sentTo("ben@example.test")).toHaveLength(1);
  });

  it("already CANCELLED / REFUNDED: 400 before any Stripe call", async () => {
    await signInAs(F.admin.super);
    for (const id of [F.order.cancelled, F.order.refunded]) {
      const before = await orderRow(id);
      const r = await cancel(id);
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/already cancelled or refunded/);
      expect(await orderRow(id)).toEqual(before);
    }
    expect(stripeState.calls).toHaveLength(0);
    expect(resendState.sent).toHaveLength(0);
  });

  it("double submit, sequential: second is 400, one refund, one email", async () => {
    await signInAs(F.admin.super);
    expect((await cancel(F.order.paidCancel)).status).toBe(200);
    expect((await cancel(F.order.paidCancel)).status).toBe(400);
    expect(stripeState.refunds).toHaveLength(1);
    expect(resendState.sent).toHaveLength(1);
  });

  it("double submit, concurrent: one Stripe refund, one 409, one email", async () => {
    await signInAs(F.admin.super);
    const rs = await Promise.all([cancel(F.order.paidCancel), cancel(F.order.paidCancel)]);
    // The loser is refused either at the status check (400, it already sees
    // CANCELLED) or at the conditional write (409), depending on timing.
    const statuses = rs.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);
    expect(stripeState.refunds).toHaveLength(1);
    expect(stripeState.charges.get("ch_paid_cancel")!.amount_refunded).toBe(12000);
    expect(resendState.sent).toHaveLength(1);
  });

  it("retry after an earlier cancel refund reached Stripe reuses it", async () => {
    await signInAs(F.admin.super);
    await new FakeStripe().refunds.create({ payment_intent: "pi_paid_cancel", metadata: { orderId: F.order.paidCancel, cancel: "true" } });
    stripeState.calls = [];
    const r = await cancel(F.order.paidCancel);
    expect(r.status).toBe(200);
    expect(r.body.refunded).toBe(true);
    expect(created()).toHaveLength(0);
    expect(stripeState.refunds).toHaveLength(1);
  });

  it("Stripe refund failure: order still cancelled (documented behavior), paymentError reported, financialStatus stays PAID, refund route can finish the job", async () => {
    await signInAs(F.admin.super);
    stripeState.failNext.set("refunds.create", "boom");
    const r = await cancel(F.order.paidCancel);
    expect(r.status).toBe(200);
    expect(r.body.refunded).toBe(false);
    expect(r.body.paymentError).toMatch(/Stripe refund failed: boom\. Refund the customer manually\./);
    expect(await GET_ORDER(F.order.paidCancel)).toMatchObject({ status: "CANCELLED", financialStatus: "PAID" });
    expect(stripeState.refunds).toHaveLength(0);
    // Customer gets the plain cancellation email (no refund claim).
    expect(await prisma.emailLog.count({ where: { relatedId: F.order.paidCancel, type: "ORDER_CANCELLED" } })).toBe(1);
    // Recovery: the refund route still accepts the PAID financial status.
    const fix = await refund(F.order.paidCancel, {});
    expect(fix.status).toBe(200);
    expect(stripeState.refunds).toHaveLength(1);
    expect((await orderRow(F.order.paidCancel)).financialStatus).toBe("REFUNDED");
  });

  it("void failure on an AUTHORIZED order is reported (paymentError) and stays AUTHORIZED", async () => {
    await signInAs(F.admin.super);
    stripeState.failNext.set("paymentIntents.cancel", "stripe down");
    const r = await cancel(F.order.authorized);
    expect(r.status).toBe(200);
    expect(r.body.paymentError).toMatch(/Releasing the card authorization failed: stripe down/);
    expect(await orderRow(F.order.authorized)).toMatchObject({ status: "CANCELLED", financialStatus: "AUTHORIZED" });
  });

  it("email failure: emailSent=false, no EmailLog, cancel stands", async () => {
    await signInAs(F.admin.super);
    resendState.failNext = "nope";
    const r = await cancel(F.order.authorized);
    expect(r.status).toBe(200);
    expect(r.body.emailSent).toBe(false);
    expect(await prisma.emailLog.count({ where: { relatedId: F.order.authorized } })).toBe(0);
    expect((await orderRow(F.order.authorized)).status).toBe("CANCELLED");
  });
});

// ── cancel: MCP ──────────────────────────────────────────────────────────────

describe("MCP orders_cancel", () => {
  it("PAID: preview → confirm → replay", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await orderRow(F.order.paidCancel);
      const flow = await previewConfirmReplay(mcp, "orders_cancel", { orderId: F.order.paidCancel, reason: "Customer asked" }, async (p) => {
        expect(p.preview).toMatchObject({
          orderNumber: "AS-1004", currentStatus: "PROCESSING", currentFinancialStatus: "PAID", newStatus: "CANCELLED",
          expectedFinancialStatus: "REFUNDED", orderTotal: 12000, reason: "Customer asked",
          email: { to: "ana@example.test", type: "ORDER_REFUNDED" },
        });
        expect(p.preview.paymentAction).toMatch(/Full refund of 12000 cents/);
        expect(await orderRow(F.order.paidCancel)).toEqual(before);
        expect(stripeState.calls).toHaveLength(0);
        expect(resendState.sent).toHaveLength(0);
      });
      expect(expectConfirmed(flow)).toMatchObject({ refunded: true, paymentError: null, emailSent: true });
      expectReplayBlocked(flow);
      expect(stripeState.refunds).toHaveLength(1);
      expect(resendState.sent).toHaveLength(1);
      expect((await mcp.call("orders_get", { orderId: F.order.paidCancel })).order).toMatchObject({ status: "CANCELLED", financialStatus: "REFUNDED", cancelReason: "Customer asked" });
    });
  });

  it("AUTHORIZED: preview says release the hold; confirm voids; replay blocked", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "orders_cancel", { orderId: F.order.authorized, reason: "Fraud check" }, (p) => {
        expect(p.preview).toMatchObject({ expectedFinancialStatus: "VOIDED", email: { type: "ORDER_CANCELLED" } });
        expect(p.preview.paymentAction).toMatch(/Release the uncaptured card authorization/);
        expect(stripeState.calls).toHaveLength(0);
      });
      expect(expectConfirmed(flow)).toMatchObject({ refunded: false, paymentError: null });
      expectReplayBlocked(flow);
      expect(stripeState.calls.filter((c) => c.method === "paymentIntents.cancel")).toHaveLength(1);
      expect(created()).toHaveLength(0);
      expect((await mcp.call("orders_get", { orderId: F.order.authorized })).order).toMatchObject({ status: "CANCELLED", financialStatus: "VOIDED" });
    });
  });

  it("already cancelled: blocked at preview", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      expect(await mcp.call("orders_cancel", { orderId: F.order.cancelled, reason: "x" })).toMatchObject({ blocked: true, status: 400 });
      expect(stripeState.calls).toHaveLength(0);
    });
  });
});
