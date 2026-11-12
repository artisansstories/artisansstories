import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ calls: [] as string[] }));

const db = vi.hoisted(() => ({
  $tenantId: "tenant_a",
  order: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
const stripe = vi.hoisted(() => ({
  paymentIntents: { retrieve: vi.fn(), cancel: vi.fn(), capture: vi.fn() },
  refunds: { create: vi.fn(), list: vi.fn(async () => ({ data: [] as unknown[] })) },
}));
const emails = vi.hoisted(() => ({ send: vi.fn() }));
const auth = vi.hoisted(() => ({ getAdminSession: vi.fn(), getTenantPrismaForAdmin: vi.fn() }));
const mail = vi.hoisted(() => ({ logEmail: vi.fn(), getEmailBranding: vi.fn() }));

vi.mock("@/lib/admin-auth", () => ({ getAdminSession: auth.getAdminSession }));
vi.mock("@/lib/tenant-context", async () => ({
  ...(await import("../helpers/tenant-context-mock")).tenantContextBase,
  getTenantPrismaForAdmin: auth.getTenantPrismaForAdmin,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("stripe", () => ({ default: class { paymentIntents = stripe.paymentIntents; refunds = stripe.refunds; } }));
vi.mock("resend", () => ({ Resend: class { emails = emails; } }));
vi.mock("@/lib/email-branding", () => ({ getEmailBranding: mail.getEmailBranding, emailLogoHtml: () => "<logo/>" }));
vi.mock("@/lib/email-log", () => ({ logEmail: mail.logEmail }));
vi.mock("@/lib/emails/order-cancelled", () => ({ orderCancelledHtml: () => "<cancelled/>" }));
vi.mock("@/lib/emails/order-shipped", () => ({ orderShippedHtml: () => "<shipped/>" }));
vi.mock("@/lib/emails/order-confirmation", () => ({ orderConfirmationHtml: () => "<confirm/>" }));
vi.mock("@/lib/tracking", () => ({ checkTracking: vi.fn() }));

import { POST } from "@/app/api/admin/orders/[id]/refund/route";

const branding = { from: "Store <s@x.test>", fromAddress: "s@x.test", replyTo: null, accentColor: "#000", storeName: "Store" };
const VERSION = new Date("2026-11-01T12:00:00.000Z");
const paidOrder = {
  id: "o1", orderNumber: "AS-1001", email: "c@x.test", total: 5000, status: "DELIVERED",
  financialStatus: "PAID", stripePaymentIntentId: "pi_1", adminNote: null, updatedAt: VERSION,
};
/** The charge as Stripe reports it after the refund. */
let chargeAfter: { amount: number; amount_refunded: number; refunded: boolean };

function call(body: unknown) {
  const req = new NextRequest("http://localhost/api/admin/orders/o1/refund", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });
  return POST(req, { params: Promise.resolve({ id: "o1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.calls.length = 0;
  chargeAfter = { amount: 5000, amount_refunded: 5000, refunded: true };
  const t = (label: string, fn: ReturnType<typeof vi.fn>, impl: (...a: never[]) => unknown) =>
    fn.mockImplementation((...a: never[]) => { h.calls.push(label); return impl(...a); });
  auth.getTenantPrismaForAdmin.mockResolvedValue(db);
  auth.getAdminSession.mockResolvedValue({ adminId: "a1", role: "OWNER" });
  t("db.findUnique", db.order.findUnique, async () => ({ ...paidOrder }));
  t("db.updateMany", db.order.updateMany, async () => ({ count: 1 }));
  t("stripe.retrieve", stripe.paymentIntents.retrieve, async () => ({ latest_charge: { id: "ch_1", ...chargeAfter } }));
  t("stripe.refund", stripe.refunds.create, async (p: { amount?: number }) => ({ id: "re_1", amount: p.amount ?? 5000, status: "succeeded" }));
  t("email.send", emails.send, async () => ({ data: { id: "em_1" } }));
  t("email.log", mail.logEmail, async () => undefined);
  mail.getEmailBranding.mockResolvedValue(branding);
});

describe("POST /api/admin/orders/[id]/refund", () => {
  it("401s with no session and never touches Stripe or the order", async () => {
    auth.getAdminSession.mockResolvedValue(null);
    const res = await call({ amount: 1000 });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(db.order.findUnique).not.toHaveBeenCalled();
    expect(db.order.updateMany).not.toHaveBeenCalled();
    expect(emails.send).not.toHaveBeenCalled();
  });

  it("401 when the tenant cannot be resolved (TenantResolutionError), not 500", async () => {
    const { TenantResolutionError } = await import("../helpers/tenant-context-mock");
    auth.getTenantPrismaForAdmin.mockRejectedValueOnce(new TenantResolutionError("No admin session"));
    const res = await call({});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("full refund: Stripe refund (by payment_intent, stable key), charge read, conditional DB update, then email + log", async () => {
    const res = await call({ reason: "damaged" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true, refundId: "re_1", amount: 5000, status: "succeeded",
      financialStatus: "REFUNDED", emailSent: true, alreadyRecorded: false,
    });
    expect(h.calls).toEqual(["db.findUnique", "stripe.refund", "stripe.retrieve", "db.updateMany", "email.send", "email.log"]);
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", reason: "requested_by_customer", metadata: { orderId: "o1", orderVersion: String(VERSION.getTime()) } },
      { idempotencyKey: `order_refund_o1_${VERSION.getTime()}_full` },
    );
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_1", { expand: ["latest_charge"] });
    const { where, data } = db.order.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "o1", updatedAt: VERSION });
    expect(data.financialStatus).toBe("REFUNDED");
    expect(data.status).toBe("REFUNDED");
    expect(data.adminNote).toMatch(/^Refund issued: damaged \(/);
    expect(db.order.update).not.toHaveBeenCalled();
    expect(emails.send.mock.calls[0][0]).toMatchObject({ to: "c@x.test", subject: "Refund issued for order AS-1001" });
    expect(mail.logEmail.mock.calls[0][0]).toMatchObject({ type: "ORDER_REFUNDED", resendId: "em_1", relatedId: "o1" });
  });

  it("retry after a lost DB write reuses the refund tagged with this order version; no second refund", async () => {
    stripe.refunds.list.mockResolvedValueOnce({ data: [{ id: "re_old", amount: 5000, status: "succeeded", metadata: { orderId: "o1", orderVersion: String(VERSION.getTime()) } }] });
    const res = await call({});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refundId: "re_old", amount: 5000, financialStatus: "REFUNDED" });
    expect(stripe.refunds.list).toHaveBeenCalledWith({ payment_intent: "pi_1", limit: 100 });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(db.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it("an earlier refund for a different order version is not reused", async () => {
    stripe.refunds.list.mockResolvedValueOnce({ data: [{ id: "re_older", amount: 1000, status: "succeeded", metadata: { orderId: "o1", orderVersion: "1" } }] });
    const res = await call({});
    expect(res.status).toBe(200);
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
  });

  it("partial refund keeps order status and marks PARTIALLY_REFUNDED", async () => {
    chargeAfter = { amount: 5000, amount_refunded: 1500, refunded: false };
    const res = await call({ amount: 1500 });
    expect(await res.json()).toMatchObject({ success: true, amount: 1500, financialStatus: "PARTIALLY_REFUNDED" });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", amount: 1500, reason: "requested_by_customer", metadata: { orderId: "o1", orderVersion: String(VERSION.getTime()) } },
      { idempotencyKey: `order_refund_o1_${VERSION.getTime()}_1500` },
    );
    const data = db.order.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ financialStatus: "PARTIALLY_REFUNDED", status: "DELIVERED" });
  });

  it("a partial refund that empties the charge marks the order REFUNDED", async () => {
    db.order.findUnique.mockResolvedValueOnce({ ...paidOrder, financialStatus: "PARTIALLY_REFUNDED" });
    chargeAfter = { amount: 5000, amount_refunded: 5000, refunded: true };
    const res = await call({ amount: 3500 });
    expect(await res.json()).toMatchObject({ amount: 3500, financialStatus: "REFUNDED" });
    expect(db.order.updateMany.mock.calls[0][0].data).toMatchObject({ financialStatus: "REFUNDED", status: "REFUNDED" });
  });

  it("a concurrent duplicate that already recorded the refund: 200 alreadyRecorded, no second email", async () => {
    db.order.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await call({});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refundId: "re_1", alreadyRecorded: true, emailSent: false });
    expect(emails.send).not.toHaveBeenCalled();
  });

  it("AUTHORIZED order is rejected with the cancel hint and no Stripe call", async () => {
    db.order.findUnique.mockResolvedValueOnce({ ...paidOrder, financialStatus: "AUTHORIZED" });
    const res = await call({});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Payment is authorized but not yet captured. Cancel the order to release the hold with no fees.",
    });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("404 for a missing order", async () => {
    db.order.findUnique.mockResolvedValueOnce(null);
    const res = await call({});
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found" });
  });

  it("Stripe failure is a 502 with moneyMoved:false and the order is not updated", async () => {
    stripe.refunds.create.mockRejectedValueOnce(new Error("Charge already refunded"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({});
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Stripe refund failed, nothing was changed: Charge already refunded",
      moneyMoved: false,
    });
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(db.order.updateMany).not.toHaveBeenCalled();
    expect(emails.send).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("DB failure after Stripe is a 500 with moneyMoved:true and the refund id; no email", async () => {
    db.order.updateMany.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({});
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toMatchObject({ moneyMoved: true, refundId: "re_1" });
    expect(json.error).toContain("re_1");
    expect(emails.send).not.toHaveBeenCalled();
  });

  it("email failure does not fail the refund (emailSent:false)", async () => {
    emails.send.mockRejectedValueOnce(new Error("resend down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, emailSent: false });
    expect(db.order.updateMany).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it("Resend {error} result also reports emailSent:false and logs nothing", async () => {
    emails.send.mockResolvedValueOnce({ data: null, error: { message: "bad from" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({});
    errSpy.mockRestore();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, emailSent: false });
    expect(mail.logEmail).not.toHaveBeenCalled();
  });
});
