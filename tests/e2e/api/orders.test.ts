/**
 * Orders domain (non-refund paths): list / CSV export / get / note / deliver /
 * fulfill / resend-email / check-tracking, through BOTH the admin routes and the
 * MCP tools. Refund + cancel money paths live in orders-money.test.ts.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import { stripeState, resendState, sentTo, carrierState } from "../helpers/fakes";
import * as listRoute from "@/app/api/admin/orders/route";
import * as oneRoute from "@/app/api/admin/orders/[id]/route";
import * as noteRoute from "@/app/api/admin/orders/[id]/note/route";
import * as deliverRoute from "@/app/api/admin/orders/[id]/deliver/route";
import * as fulfillRoute from "@/app/api/admin/orders/[id]/fulfill/route";
import * as resendRoute from "@/app/api/admin/orders/[id]/resend-email/route";
import * as cancelRoute from "@/app/api/admin/orders/[id]/cancel/route";
import * as refundRoute from "@/app/api/admin/orders/[id]/refund/route";
import * as trackingRoute from "@/app/api/admin/orders/check-tracking/route";

const GET_ORDER = (id: string) => call(oneRoute.GET as never, "GET", `/api/admin/orders/${id}`, { params: { id } });

async function withMcp<T>(key: string, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const mcp = await connectMcp(key);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}

const orderRow = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });

// ── auth ─────────────────────────────────────────────────────────────────────

describe("orders routes: no session → 401", () => {
  const cases: Array<[string, () => Promise<{ status: number }>]> = [
    ["GET /orders", () => call(listRoute.GET as never, "GET", "/api/admin/orders")],
    ["GET /orders?export=csv", () => call(listRoute.GET as never, "GET", "/api/admin/orders", { query: { export: "csv" } })],
    ["GET /orders/[id]", () => GET_ORDER(F.order.paid)],
    ["PATCH /orders/[id]/note", () => call(noteRoute.PATCH as never, "PATCH", `/api/admin/orders/${F.order.paid}/note`, { params: { id: F.order.paid }, body: { adminNote: "x" } })],
    ["POST /orders/[id]/deliver", () => call(deliverRoute.POST as never, "POST", `/api/admin/orders/${F.order.shipped}/deliver`, { params: { id: F.order.shipped } })],
    ["POST /orders/[id]/fulfill", () => call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${F.order.paid}/fulfill`, { params: { id: F.order.paid }, body: { trackingCompany: "USPS", trackingNumber: "1", notifyCustomer: true, items: [{ orderItemId: F.orderItem.paidHammock, quantity: 1 }] } })],
    ["POST /orders/[id]/cancel", () => call(cancelRoute.POST as never, "POST", `/api/admin/orders/${F.order.paid}/cancel`, { params: { id: F.order.paid }, body: { reason: "x" } })],
    ["POST /orders/[id]/refund", () => call(refundRoute.POST as never, "POST", `/api/admin/orders/${F.order.paid}/refund`, { params: { id: F.order.paid }, body: {} })],
    ["POST /orders/[id]/resend-email", () => call(resendRoute.POST as never, "POST", `/api/admin/orders/${F.order.paid}/resend-email`, { params: { id: F.order.paid } })],
    ["POST /orders/check-tracking", () => call(trackingRoute.POST as never, "POST", "/api/admin/orders/check-tracking")],
  ];
  for (const [name, run] of cases) {
    it(name, async () => {
      const before = await orderRow(F.order.paid);
      const r = await run();
      expect(r.status).toBe(401);
      // Nothing happened anywhere.
      expect(stripeState.calls).toHaveLength(0);
      expect(resendState.sent).toHaveLength(0);
      expect(carrierState.calls).toHaveLength(0);
      expect(await orderRow(F.order.paid)).toEqual(before);
      expect((await orderRow(F.order.shipped)).status).toBe("SHIPPED");
    });
  }
});

describe("orders routes: unknown / other-tenant id → 404, never 500", () => {
  const ids = ["nope_does_not_exist", F.order.other];
  for (const id of ids) {
    it(`every [id] route 404s for ${id}`, async () => {
      await signInAs(F.admin.super);
      const p = { params: { id } };
      const results = {
        get: await GET_ORDER(id),
        note: await call(noteRoute.PATCH as never, "PATCH", `/api/admin/orders/${id}/note`, { ...p, body: { adminNote: "hijack" } }),
        deliver: await call(deliverRoute.POST as never, "POST", `/api/admin/orders/${id}/deliver`, p),
        fulfill: await call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${id}/fulfill`, { ...p, body: { trackingCompany: "USPS", trackingNumber: "1", notifyCustomer: true, items: [{ orderItemId: F.orderItem.other, quantity: 1 }] } }),
        cancel: await call(cancelRoute.POST as never, "POST", `/api/admin/orders/${id}/cancel`, { ...p, body: { reason: "x" } }),
        refund: await call(refundRoute.POST as never, "POST", `/api/admin/orders/${id}/refund`, { ...p, body: {} }),
        resend: await call(resendRoute.POST as never, "POST", `/api/admin/orders/${id}/resend-email`, p),
      };
      for (const [name, r] of Object.entries(results)) {
        expect(r.status, `${name}: ${r.text}`).toBe(404);
        expect(r.body.error).toMatch(/not found/i);
      }
      // The other store's order is untouched.
      const other = await orderRow(F.order.other);
      expect(other).toMatchObject({ status: "PROCESSING", financialStatus: "PAID", adminNote: null });
      expect(await prisma.fulfillment.count({ where: { orderId: F.order.other } })).toBe(0);
      expect(stripeState.calls.filter((c) => c.method !== "refunds.list")).toHaveLength(0);
      expect(resendState.sent).toHaveLength(0);
    });
  }

  it("MCP tools 404 (blocked, not an error) for an unknown and an other-tenant order", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      for (const orderId of ["nope_does_not_exist", F.order.other]) {
        expect(await mcp.call("orders_get", { orderId })).toMatchObject({ blocked: true, status: 404 });
        for (const [tool, extra] of [
          ["orders_set_note", { adminNote: "x" }],
          ["orders_mark_delivered", {}],
          ["orders_fulfill", { trackingCompany: "USPS", trackingNumber: "1", notifyCustomer: false, items: [{ orderItemId: F.orderItem.other, quantity: 1 }] }],
          ["orders_cancel", { reason: "x" }],
          ["orders_refund", {}],
          ["orders_resend_confirmation", {}],
        ] as const) {
          const r = await mcp.call(tool, { orderId, ...extra });
          expect(r, `${tool} ${orderId}`).toMatchObject({ done: false, blocked: true, status: 404 });
        }
      }
      expect(await mcp.call("orders_get", { orderNumber: "OS-2001" })).toMatchObject({ blocked: true, status: 404 });
    });
  });
});

describe("MCP: read-only key cannot use order write tools", () => {
  it("houseRead sees orders_list/orders_get but no write tools", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      const names = await mcp.toolNames();
      expect(names).toEqual(expect.arrayContaining(["orders_list", "orders_get"]));
      for (const t of ["orders_set_note", "orders_mark_delivered", "orders_fulfill", "orders_cancel", "orders_refund", "orders_resend_confirmation", "orders_check_tracking"]) {
        expect(names).not.toContain(t);
      }
      const r = (await mcp.raw("orders_refund", { orderId: F.order.paid })) as { isError?: boolean };
      expect(r.isError).toBe(true);
      expect(stripeState.calls).toHaveLength(0);
    });
  });
});

// ── list / export / get ──────────────────────────────────────────────────────

describe("GET /api/admin/orders + orders_list", () => {
  it("route lists only this store's 11 orders, newest first, with counts and active return status", async () => {
    await signInAs(F.admin.super);
    const r = await call(listRoute.GET as never, "GET", "/api/admin/orders", { query: { limit: "50" } });
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(11);
    expect(r.body.totalPages).toBe(1);
    const nums = r.body.orders.map((o: any) => o.orderNumber);
    expect(nums[0]).toBe("AS-1001");
    expect(nums).not.toContain("OS-2001");
    const auth = r.body.orders.find((o: any) => o.id === F.order.authorized);
    expect(auth).toMatchObject({ orderNumber: "AS-1002", status: "PROCESSING", financialStatus: "AUTHORIZED", total: 15500, itemsCount: 2, email: "ana@example.test" });
    expect(auth.customer).toMatchObject({ id: F.cust.ana, firstName: "Ana" });
    expect(r.body.orders.find((o: any) => o.id === F.order.delivered).activeReturnStatus).toBe("REQUESTED");
    // REJECTED returns don't count as active.
    expect(r.body.orders.find((o: any) => o.id === F.order.shipped).activeReturnStatus).toBeNull();
  });

  it("route filters: status, financialStatus, search, date range, pagination", async () => {
    await signInAs(F.admin.super);
    const q = (query: Record<string, string>) => call(listRoute.GET as never, "GET", "/api/admin/orders", { query });
    expect((await q({ status: "SHIPPED" })).body.orders.map((o: any) => o.id)).toEqual([F.order.shipped]);
    expect((await q({ financialStatus: "PARTIALLY_REFUNDED" })).body.orders.map((o: any) => o.id)).toEqual([F.order.partial]);
    expect((await q({ search: "ben@EXAMPLE" })).body.total).toBe(4);
    expect((await q({ search: "as-1003" })).body.orders.map((o: any) => o.id)).toEqual([F.order.paid]);
    const since = new Date(Date.now() - 3.5 * 864e5).toISOString().slice(0, 10);
    const recent = await q({ startDate: since });
    expect(recent.body.orders.every((o: any) => new Date(o.createdAt) >= new Date(since))).toBe(true);
    const old = (await q({ endDate: new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10) })).body.orders.map((o: any) => o.id);
    expect(old.sort()).toEqual([F.order.cancelled, F.order.refunded].sort());
    const p2 = await q({ limit: "5", page: "2" });
    expect(p2.body).toMatchObject({ total: 11, page: 2, totalPages: 3 });
    expect(p2.body.orders).toHaveLength(5);
    // Unknown status values are ignored, not errors.
    expect((await q({ status: "BOGUS" })).body.total).toBe(11);
  });

  it("route: malformed page/limit/date query params don't 500", async () => {
    await signInAs(F.admin.super);
    const bad: Record<string, string>[] = [{ page: "abc" }, { limit: "abc" }, { startDate: "not-a-date" }, { endDate: "garbage" }];
    for (const query of bad) {
      const r = await call(listRoute.GET as never, "GET", "/api/admin/orders", { query });
      expect(r.status, `${JSON.stringify(query)}: ${r.text}`).toBe(200);
      expect(r.body.total).toBe(11);
    }
  });

  it("?export=csv returns this store's orders as CSV", async () => {
    await signInAs(F.admin.super);
    const r = await call(listRoute.GET as never, "GET", "/api/admin/orders", { query: { export: "csv", status: "PROCESSING" } });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.headers.get("content-disposition")).toContain('filename="orders.csv"');
    const lines = r.text.split("\n");
    expect(lines[0]).toBe('"Order #","Date","Email","Status","Financial Status","Total","Items"');
    expect(lines).toHaveLength(4); // header + AS-1002/1003/1004
    const auth = lines.find((l) => l.startsWith('"AS-1002"'))!;
    expect(auth).toContain('"ana@example.test","PROCESSING","AUTHORIZED","$155.00","2"');
    expect(r.text).not.toContain("OS-2001");
    // Unfiltered export has every house order.
    const all = await call(listRoute.GET as never, "GET", "/api/admin/orders", { query: { export: "csv" } });
    expect(all.text.split("\n")).toHaveLength(12);
  });

  it("orders_list returns seeded data with filters", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const all = await mcp.call("orders_list", { limit: 100 });
      expect(all.total).toBe(11);
      expect(all.orders.map((o: any) => o.orderNumber)).not.toContain("OS-2001");
      expect(all.orders.find((o: any) => o.id === F.order.paid)).toMatchObject({ orderNumber: "AS-1003", financialStatus: "PAID", total: 12000, itemsCount: 1 });
      const refunded = await mcp.call("orders_list", { financialStatus: "REFUNDED" });
      expect(refunded.orders.map((o: any) => o.id)).toEqual([F.order.refunded]);
      const s = await mcp.call("orders_list", { status: "DELIVERED", search: "ana@" });
      expect(s.orders.map((o: any) => o.id).sort()).toEqual([F.order.delivered, F.order.paidReturn, F.order.partial].sort());
      // Nulls (models pad optionals) are fine.
      expect((await mcp.call("orders_list", { status: null, page: null, startDate: "garbage" })).total).toBe(11);
    });
    await withMcp(KEYS.otherRead, async (mcp) => {
      const o = await mcp.call("orders_list", {});
      expect(o.orders.map((x: any) => x.id)).toEqual([F.order.other]);
    });
  });
});

describe("GET /api/admin/orders/[id] + orders_get", () => {
  it("route returns the order with customer, items, fulfillments and returns", async () => {
    await signInAs(F.admin.super);
    const r = await GET_ORDER(F.order.delivered);
    expect(r.status).toBe(200);
    const o = r.body.order;
    expect(o).toMatchObject({ id: F.order.delivered, orderNumber: "AS-1009", status: "DELIVERED", financialStatus: "PAID", total: 12000 });
    expect(o.customer).toMatchObject({ id: F.cust.ana, email: "ana@example.test" });
    expect(o.items.map((i: any) => i.id)).toEqual([F.orderItem.deliveredHammock]);
    expect(o.fulfillments).toHaveLength(1);
    expect(o.fulfillments[0]).toMatchObject({ id: F.fulfillment.delivered, trackingCompany: "UPS", trackingNumber: "1Z999AA10123456784" });
    expect(o.returns.map((x: any) => x.id)).toEqual([F.ret.requested]);
    expect((await GET_ORDER(F.order.paid)).body.order).toMatchObject({ adminNote: "Gift wrap requested", discountCode: "SAVE10" });
  });

  it("orders_get by id and by order number", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      const byId = await mcp.call("orders_get", { orderId: F.order.authorized });
      expect(byId.order).toMatchObject({ orderNumber: "AS-1002", financialStatus: "AUTHORIZED", stripePaymentIntentId: "pi_authorized" });
      expect(byId.order.items.map((i: any) => i.id).sort()).toEqual([F.orderItem.authorizedHammock, F.orderItem.authorizedMug].sort());
      const byNum = await mcp.call("orders_get", { orderNumber: "AS-1008" });
      expect(byNum.order.id).toBe(F.order.shipped);
      expect(byNum.order.fulfillments[0]).toMatchObject({ id: F.fulfillment.shipped, trackingNumber: "9400100000000000000001" });
      expect(await mcp.call("orders_get", {})).toMatchObject({ blocked: true, status: 404 });
      expect(await mcp.call("orders_get", { orderNumber: "AS-9999" })).toMatchObject({ blocked: true, status: 404 });
    });
  });
});

// ── note ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/orders/[id]/note + orders_set_note", () => {
  it("route replaces the note; GET shows it", async () => {
    await signInAs(F.admin.super);
    const r = await call(noteRoute.PATCH as never, "PATCH", `/api/admin/orders/${F.order.paid}/note`, { params: { id: F.order.paid }, body: { adminNote: "Ship with ribbon" } });
    expect(r.status).toBe(200);
    expect(r.body.order).toMatchObject({ id: F.order.paid, adminNote: "Ship with ribbon" });
    expect((await GET_ORDER(F.order.paid)).body.order.adminNote).toBe("Ship with ribbon");
    // Clearing the note is allowed.
    const cleared = await call(noteRoute.PATCH as never, "PATCH", `/api/admin/orders/${F.order.paid}/note`, { params: { id: F.order.paid }, body: { adminNote: "" } });
    expect(cleared.status).toBe(200);
    expect((await GET_ORDER(F.order.paid)).body.order.adminNote).toBe("");
  });

  it("route rejects a missing/non-string note instead of silently succeeding", async () => {
    await signInAs(F.admin.super);
    for (const body of [{}, { adminNote: 42 }]) {
      const r = await call(noteRoute.PATCH as never, "PATCH", `/api/admin/orders/${F.order.paid}/note`, { params: { id: F.order.paid }, body });
      expect(r.status, r.text).toBe(400);
    }
    expect((await orderRow(F.order.paid)).adminNote).toBe("Gift wrap requested");
  });

  it("MCP preview → confirm → replay", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const args = { orderId: F.order.paid, adminNote: "Call before delivery" };
      const flow = await previewConfirmReplay(mcp, "orders_set_note", args, async (p) => {
        expect(p.preview).toMatchObject({ orderNumber: "AS-1003", currentNote: "Gift wrap requested", newNote: "Call before delivery" });
        expect((await orderRow(F.order.paid)).adminNote).toBe("Gift wrap requested");
      });
      expect(expectConfirmed(flow).order.adminNote).toBe("Call before delivery");
      expectReplayBlocked(flow);
      expect((await mcp.call("orders_get", { orderId: F.order.paid })).order.adminNote).toBe("Call before delivery");
      // A token for different arguments is refused.
      const p = await mcp.call("orders_set_note", args);
      const forged = await mcp.call("orders_set_note", { ...args, adminNote: "tampered", confirmToken: p.confirmToken });
      expect(forged).toMatchObject({ done: false, blocked: true });
      expect((await orderRow(F.order.paid)).adminNote).toBe("Call before delivery");
    });
  });
});

// ── deliver ──────────────────────────────────────────────────────────────────

describe("POST /api/admin/orders/[id]/deliver + orders_mark_delivered", () => {
  it("route delivers SHIPPED and FULFILLED orders, sends no email", async () => {
    await signInAs(F.admin.super);
    for (const id of [F.order.shipped, F.order.fulfilled]) {
      const r = await call(deliverRoute.POST as never, "POST", `/api/admin/orders/${id}/deliver`, { params: { id } });
      expect(r.status).toBe(200);
      expect(r.body.order).toMatchObject({ id, status: "DELIVERED" });
      expect((await GET_ORDER(id)).body.order.status).toBe("DELIVERED");
    }
    expect(resendState.sent).toHaveLength(0);
  });

  it("route rejects orders that haven't shipped (400, unchanged)", async () => {
    await signInAs(F.admin.super);
    for (const id of [F.order.paid, F.order.pending, F.order.cancelled, F.order.delivered]) {
      const before = await orderRow(id);
      const r = await call(deliverRoute.POST as never, "POST", `/api/admin/orders/${id}/deliver`, { params: { id } });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/shipped/);
      expect((await orderRow(id)).status).toBe(before.status);
    }
  });

  it("MCP preview → confirm → replay", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "orders_mark_delivered", { orderId: F.order.shipped }, async (p) => {
        expect(p.preview).toMatchObject({ orderNumber: "AS-1008", currentStatus: "SHIPPED", newStatus: "DELIVERED", emailsSent: [] });
        expect((await orderRow(F.order.shipped)).status).toBe("SHIPPED");
      });
      expect(expectConfirmed(flow).order.status).toBe("DELIVERED");
      expectReplayBlocked(flow);
      expect((await mcp.call("orders_get", { orderId: F.order.shipped })).order.status).toBe("DELIVERED");
      expect(await mcp.call("orders_mark_delivered", { orderId: F.order.paid })).toMatchObject({ blocked: true, status: 400 });
      expect(resendState.sent).toHaveLength(0);
    });
  });
});

// ── fulfill ──────────────────────────────────────────────────────────────────

const fulfillBody = (items: Array<{ orderItemId: string; quantity: number }>, over: Record<string, unknown> = {}) => ({
  trackingCompany: "USPS", trackingNumber: "9400111111111111111111", trackingUrl: "https://tools.usps.com/t", notifyCustomer: true, items, ...over,
});

describe("POST /api/admin/orders/[id]/fulfill + orders_fulfill", () => {
  it("route: fulfilling every item ships the PAID order, records the fulfillment, emails the customer (no Stripe)", async () => {
    await signInAs(F.admin.super);
    const r = await call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${F.order.paid}/fulfill`, {
      params: { id: F.order.paid }, body: fulfillBody([{ orderItemId: F.orderItem.paidHammock, quantity: 1 }], { estimatedDelivery: "2026-12-01" }),
    });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ paymentError: null, emailSent: true });
    expect(r.body.fulfillment).toMatchObject({ orderId: F.order.paid, trackingCompany: "USPS", trackingNumber: "9400111111111111111111", status: "SUCCESS" });
    const o = (await GET_ORDER(F.order.paid)).body.order;
    expect(o).toMatchObject({ status: "SHIPPED", financialStatus: "PAID" });
    expect(o.items[0].fulfillmentStatus).toBe("fulfilled");
    expect(o.fulfillments).toHaveLength(1);
    expect(o.fulfillments[0].items).toEqual([{ orderItemId: F.orderItem.paidHammock, quantity: 1 }]);
    expect(stripeState.calls).toHaveLength(0);
    const mails = sentTo("ana@example.test");
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("Your order AS-1003 has shipped!");
    expect(mails[0].html).toContain("9400111111111111111111");
    expect(mails[0].html).toContain("/api/auth/customer/verify?token=");
    const logs = await prisma.emailLog.findMany({ where: { relatedId: F.order.paid, type: "ORDER_SHIPPED" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ tenantId: HOUSE, toEmail: "ana@example.test" });
    expect(await prisma.magicLinkToken.count({ where: { email: "ana@example.test", tenantId: HOUSE } })).toBe(1);
  });

  it("route: no tracking number → FULFILLED; notifyCustomer=false sends nothing", async () => {
    await signInAs(F.admin.super);
    const r = await call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${F.order.paidCancel}/fulfill`, {
      params: { id: F.order.paidCancel }, body: fulfillBody([{ orderItemId: F.orderItem.paidCancelHammock, quantity: 1 }], { trackingNumber: "  ", notifyCustomer: false }),
    });
    expect(r.status).toBe(200);
    expect(r.body.emailSent).toBeUndefined();
    expect((await GET_ORDER(F.order.paidCancel)).body.order.status).toBe("FULFILLED");
    expect(resendState.sent).toHaveLength(0);
  });

  it("route: partial fulfillment of the AUTHORIZED order keeps it PROCESSING and does NOT capture", async () => {
    await signInAs(F.admin.super);
    const r = await call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${F.order.authorized}/fulfill`, {
      params: { id: F.order.authorized }, body: fulfillBody([{ orderItemId: F.orderItem.authorizedHammock, quantity: 1 }], { notifyCustomer: false }),
    });
    expect(r.status).toBe(200);
    const o = (await GET_ORDER(F.order.authorized)).body.order;
    expect(o).toMatchObject({ status: "PROCESSING", financialStatus: "AUTHORIZED" });
    expect(o.items.find((i: any) => i.id === F.orderItem.authorizedHammock).fulfillmentStatus).toBe("fulfilled");
    expect(o.items.find((i: any) => i.id === F.orderItem.authorizedMug).fulfillmentStatus).not.toBe("fulfilled");
    expect(stripeState.calls).toHaveLength(0);
  });

  it("route: fulfilling the last item of the AUTHORIZED order captures the payment once (key order_capture_<id>)", async () => {
    await signInAs(F.admin.super);
    const body = fulfillBody([{ orderItemId: F.orderItem.authorizedHammock, quantity: 1 }, { orderItemId: F.orderItem.authorizedMug, quantity: 1 }]);
    const r = await call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${F.order.authorized}/fulfill`, { params: { id: F.order.authorized }, body });
    expect(r.status).toBe(200);
    expect(r.body.paymentError).toBeNull();
    const captures = stripeState.calls.filter((c) => c.method === "paymentIntents.capture");
    expect(captures).toHaveLength(1);
    expect(captures[0].args[0]).toBe("pi_authorized");
    expect(captures[0].idempotencyKey).toBe(`order_capture_${F.order.authorized}`);
    expect(stripeState.pis.get("pi_authorized")!.status).toBe("succeeded");
    expect((await GET_ORDER(F.order.authorized)).body.order).toMatchObject({ status: "SHIPPED", financialStatus: "PAID" });
    expect(sentTo("ana@example.test")).toHaveLength(1);
  });

  it("route: capture failure is reported (paymentError), order ships but stays AUTHORIZED", async () => {
    await signInAs(F.admin.super);
    stripeState.failNext.set("paymentIntents.capture", "card_declined");
    const body = fulfillBody([{ orderItemId: F.orderItem.authorizedHammock, quantity: 1 }, { orderItemId: F.orderItem.authorizedMug, quantity: 1 }], { notifyCustomer: false });
    const r = await call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${F.order.authorized}/fulfill`, { params: { id: F.order.authorized }, body });
    expect(r.status).toBe(200);
    expect(r.body.paymentError).toMatch(/Capturing the card payment failed: card_declined/);
    expect((await GET_ORDER(F.order.authorized)).body.order).toMatchObject({ status: "SHIPPED", financialStatus: "AUTHORIZED" });
    expect(stripeState.pis.get("pi_authorized")!.status).toBe("requires_capture");
  });

  it("route: shipped-email failure is reported as emailSent=false, no EmailLog", async () => {
    await signInAs(F.admin.super);
    resendState.failNext = "mailbox full";
    const r = await call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${F.order.paid}/fulfill`, {
      params: { id: F.order.paid }, body: fulfillBody([{ orderItemId: F.orderItem.paidHammock, quantity: 1 }]),
    });
    expect(r.status).toBe(200);
    expect(r.body.emailSent).toBe(false);
    expect((await orderRow(F.order.paid)).status).toBe("SHIPPED");
    expect(await prisma.emailLog.count({ where: { relatedId: F.order.paid, type: "ORDER_SHIPPED" } })).toBe(0);
  });

  it("route rejects item ids from another order (incl. other tenant) and empty item lists; nothing written", async () => {
    await signInAs(F.admin.super);
    for (const items of [[{ orderItemId: F.orderItem.shippedHammock, quantity: 1 }], [{ orderItemId: F.orderItem.paidHammock, quantity: 1 }, { orderItemId: F.orderItem.other, quantity: 1 }], []]) {
      const r = await call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${F.order.paid}/fulfill`, { params: { id: F.order.paid }, body: fulfillBody(items) });
      expect(r.status, r.text).toBe(400);
    }
    expect(await prisma.fulfillment.count({ where: { orderId: F.order.paid } })).toBe(0);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: F.orderItem.shippedHammock } })).fulfillmentStatus).toBe("fulfilled");
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: F.orderItem.paidHammock } })).fulfillmentStatus).not.toBe("fulfilled");
    expect((await orderRow(F.order.paid)).status).toBe("PROCESSING");
    expect(resendState.sent).toHaveLength(0);
  });

  it("route refuses to fulfill a CANCELLED or REFUNDED order (would flip it back to SHIPPED and email the customer)", async () => {
    await signInAs(F.admin.super);
    for (const [id, itemId] of [[F.order.cancelled, F.orderItem.cancelledHammock], [F.order.refunded, F.orderItem.refundedHammock]] as const) {
      const r = await call(fulfillRoute.POST as never, "POST", `/api/admin/orders/${id}/fulfill`, { params: { id }, body: fulfillBody([{ orderItemId: itemId, quantity: 1 }]) });
      expect(r.status, r.text).toBe(400);
      expect(await prisma.fulfillment.count({ where: { orderId: id } })).toBe(0);
    }
    expect((await orderRow(F.order.cancelled)).status).toBe("CANCELLED");
    expect((await orderRow(F.order.refunded)).status).toBe("REFUNDED");
    expect(resendState.sent).toHaveLength(0);
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const p = await mcp.call("orders_fulfill", { orderId: F.order.cancelled, ...fulfillBody([{ orderItemId: F.orderItem.cancelledHammock, quantity: 1 }]) });
      expect(p).toMatchObject({ done: false, blocked: true, status: 400 });
    });
  });

  it("MCP preview → confirm → replay on the AUTHORIZED order (capture shown in preview, captured once)", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const args = { orderId: F.order.authorized, ...fulfillBody([{ orderItemId: F.orderItem.authorizedHammock, quantity: 1 }, { orderItemId: F.orderItem.authorizedMug, quantity: 1 }]) };
      const flow = await previewConfirmReplay(mcp, "orders_fulfill", args, async (p) => {
        expect(p.preview).toMatchObject({
          orderNumber: "AS-1002", currentStatus: "PROCESSING", allItemsFulfilledAfter: true, newStatus: "SHIPPED",
          paymentCapture: { amount: 15500 }, email: { to: "ana@example.test", type: "ORDER_SHIPPED" },
        });
        expect(await prisma.fulfillment.count({ where: { orderId: F.order.authorized } })).toBe(0);
        expect((await orderRow(F.order.authorized)).financialStatus).toBe("AUTHORIZED");
        expect(stripeState.calls).toHaveLength(0);
        expect(resendState.sent).toHaveLength(0);
      });
      const res = expectConfirmed(flow);
      expect(res).toMatchObject({ paymentError: null, emailSent: true });
      expectReplayBlocked(flow);
      expect(stripeState.calls.filter((c) => c.method === "paymentIntents.capture")).toHaveLength(1);
      expect(stripeState.calls[0].idempotencyKey).toBe(`order_capture_${F.order.authorized}`);
      expect(resendState.sent).toHaveLength(1);
      expect(await prisma.fulfillment.count({ where: { orderId: F.order.authorized } })).toBe(1);
      const o = (await mcp.call("orders_get", { orderId: F.order.authorized })).order;
      expect(o).toMatchObject({ status: "SHIPPED", financialStatus: "PAID" });
      expect(o.fulfillments[0]).toMatchObject({ trackingNumber: "9400111111111111111111" });
    });
  });

  it("MCP preview rejects an item from another order", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const r = await mcp.call("orders_fulfill", { orderId: F.order.paid, ...fulfillBody([{ orderItemId: F.orderItem.authorizedMug, quantity: 1 }]) });
      expect(r).toMatchObject({ blocked: true, status: 400 });
      expect(r.reason).toContain(F.orderItem.authorizedMug);
    });
  });
});

// ── resend confirmation ──────────────────────────────────────────────────────

describe("POST /api/admin/orders/[id]/resend-email + orders_resend_confirmation", () => {
  it("route emails the confirmation and logs it", async () => {
    await signInAs(F.admin.super);
    const r = await call(resendRoute.POST as never, "POST", `/api/admin/orders/${F.order.paid}/resend-email`, { params: { id: F.order.paid } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    const mails = sentTo("ana@example.test");
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("Order Confirmed — AS-1003");
    expect(mails[0].html).toContain("Woven Hammock");
    const logs = await prisma.emailLog.findMany({ where: { relatedId: F.order.paid, type: "ORDER_CONFIRMATION" }, orderBy: { createdAt: "asc" } });
    expect(logs).toHaveLength(2); // seeded original + this one
    expect(logs[1]).toMatchObject({ tenantId: HOUSE, toEmail: "ana@example.test", relatedType: "ORDER" });
  });

  it("route reports a provider rejection as 502 and logs nothing", async () => {
    await signInAs(F.admin.super);
    resendState.failNext = "domain not verified";
    const r = await call(resendRoute.POST as never, "POST", `/api/admin/orders/${F.order.paid}/resend-email`, { params: { id: F.order.paid } });
    expect(r.status).toBe(502);
    expect(r.body.error).toContain("domain not verified");
    expect(await prisma.emailLog.count({ where: { relatedId: F.order.paid, type: "ORDER_CONFIRMATION" } })).toBe(1);
  });

  it("MCP preview → confirm → replay", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "orders_resend_confirmation", { orderId: F.order.paid }, async (p) => {
        expect(p.preview).toMatchObject({ orderNumber: "AS-1003", confirmationEmailsAlreadySent: 1, orderTotal: 12000, email: { to: "ana@example.test" } });
        expect(resendState.sent).toHaveLength(0);
      });
      expect(expectConfirmed(flow)).toEqual({ ok: true });
      expectReplayBlocked(flow);
      expect(resendState.sent).toHaveLength(1);
      expect(await prisma.emailLog.count({ where: { relatedId: F.order.paid, type: "ORDER_CONFIRMATION" } })).toBe(2);
      const again = await mcp.call("orders_resend_confirmation", { orderId: F.order.paid });
      expect(again.preview.confirmationEmailsAlreadySent).toBe(2);
    });
  });
});

// ── check tracking ───────────────────────────────────────────────────────────

describe("POST /api/admin/orders/check-tracking + orders_check_tracking", () => {
  it("route marks SHIPPED orders the carrier reports delivered", async () => {
    await signInAs(F.admin.super);
    carrierState.statuses.set("9400100000000000000001", "delivered");
    const r = await call(trackingRoute.POST as never, "POST", "/api/admin/orders/check-tracking");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ checked: 1, delivered: 1, message: "1 order marked as delivered" });
    expect(r.body.results[0]).toMatchObject({ orderId: F.order.shipped, carrier: "USPS", trackingNumber: "9400100000000000000001", status: "delivered", changed: true });
    expect(carrierState.calls).toEqual([{ carrier: "USPS", trackingNumber: "9400100000000000000001" }]);
    expect((await GET_ORDER(F.order.shipped)).body.order.status).toBe("DELIVERED");
    expect(resendState.sent).toHaveLength(0);
    // Second run: nothing SHIPPED any more.
    const again = await call(trackingRoute.POST as never, "POST", "/api/admin/orders/check-tracking");
    expect(again.body).toMatchObject({ checked: 0, delivered: 0 });
  });

  it("route leaves in-transit orders SHIPPED", async () => {
    await signInAs(F.admin.super);
    const r = await call(trackingRoute.POST as never, "POST", "/api/admin/orders/check-tracking");
    expect(r.body).toMatchObject({ checked: 1, delivered: 0, message: "No new deliveries detected" });
    expect((await orderRow(F.order.shipped)).status).toBe("SHIPPED");
  });

  it("route never touches the other store's shipped orders", async () => {
    await prisma.order.update({ where: { id: F.order.other }, data: { status: "SHIPPED" } });
    await prisma.fulfillment.create({ data: { tenantId: "tenant_other_store", orderId: F.order.other, status: "SUCCESS", trackingCompany: "UPS", trackingNumber: "1ZOTHER", shippedAt: new Date(), items: [] } });
    carrierState.statuses.set("1ZOTHER", "delivered");
    await signInAs(F.admin.super);
    const r = await call(trackingRoute.POST as never, "POST", "/api/admin/orders/check-tracking");
    expect(r.body.checked).toBe(1);
    expect((await orderRow(F.order.other)).status).toBe("SHIPPED");
  });

  it("MCP preview → confirm → replay", async () => {
    carrierState.statuses.set("9400100000000000000001", "delivered");
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "orders_check_tracking", {}, async (p) => {
        expect(p.preview.ordersToCheck).toEqual([{ orderNumber: "AS-1008", carrier: "USPS", trackingNumber: "9400100000000000000001" }]);
        expect(carrierState.calls).toHaveLength(0);
        expect((await orderRow(F.order.shipped)).status).toBe("SHIPPED");
      });
      expect(expectConfirmed(flow)).toMatchObject({ checked: 1, delivered: 1 });
      expectReplayBlocked(flow);
      expect(carrierState.calls).toHaveLength(1);
      const list = await mcp.call("orders_list", { status: "DELIVERED" });
      expect(list.orders.map((o: any) => o.id)).toContain(F.order.shipped);
    });
  });
});
