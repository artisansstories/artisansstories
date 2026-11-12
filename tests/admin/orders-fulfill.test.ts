import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ calls: [] as string[] }));

const db = vi.hoisted(() => ({
  $tenantId: "tenant_a",
  order: { findUnique: vi.fn(), update: vi.fn() },
  customer: { findUnique: vi.fn() },
  fulfillment: { create: vi.fn() },
  orderItem: { update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
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
const gprisma = vi.hoisted(() => ({ magicLinkToken: { create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: gprisma }));
vi.mock("stripe", () => ({ default: class { paymentIntents = stripe.paymentIntents; refunds = stripe.refunds; } }));
vi.mock("resend", () => ({ Resend: class { emails = emails; } }));
vi.mock("@/lib/email-branding", () => ({ getEmailBranding: mail.getEmailBranding, emailLogoHtml: () => "<logo/>" }));
vi.mock("@/lib/email-log", () => ({ logEmail: mail.logEmail }));
vi.mock("@/lib/emails/order-cancelled", () => ({ orderCancelledHtml: () => "<cancelled/>" }));
vi.mock("@/lib/emails/order-shipped", () => ({ orderShippedHtml: () => "<shipped/>" }));
vi.mock("@/lib/emails/order-confirmation", () => ({ orderConfirmationHtml: () => "<confirm/>" }));
vi.mock("@/lib/tracking", () => ({ checkTracking: vi.fn() }));

import { POST } from "@/app/api/admin/orders/[id]/fulfill/route";

const branding = { from: "Store <s@x.test>", fromAddress: "s@x.test", replyTo: null, accentColor: "#000", storeName: "Store" };
const t = (label: string, fn: ReturnType<typeof vi.fn>, impl: (...a: never[]) => unknown) =>
  fn.mockImplementation((...a: never[]) => { h.calls.push(label); return impl(...a); });

function req(path: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/orders/o1/${path}`, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}
const ctx = { params: Promise.resolve({ id: "o1" }) };

function resetCommon() {
  vi.clearAllMocks();
  h.calls.length = 0;
  auth.getTenantPrismaForAdmin.mockResolvedValue(db);
  auth.getAdminSession.mockResolvedValue({ adminId: "a1", role: "OWNER" });
  mail.getEmailBranding.mockResolvedValue(branding);
  t("email.send", emails.send, async () => ({ data: { id: "em_1" } }));
  t("email.log", mail.logEmail, async () => undefined);
}

const baseOrder = {
  id: "o1", orderNumber: "AS-1001", email: "c@x.test", total: 5000, status: "PAID",
  financialStatus: "AUTHORIZED", stripePaymentIntentId: "pi_1",
  items: [
    { id: "oi_1", title: "Bowl", variantTitle: null, quantity: 1, productSnapshot: { image: "https://img/1.jpg" }, fulfillmentStatus: null },
  ],
};
const body = {
  trackingCompany: "USPS", trackingNumber: "9400 1", notifyCustomer: true,
  items: [{ orderItemId: "oi_1", quantity: 1 }],
};

beforeEach(() => {
  resetCommon();
  // Interactive transaction: run the callback against the same mock client and
  // record the tx boundaries so ordering assertions can see them.
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => {
    h.calls.push("tx.begin");
    const r = await fn(db);
    h.calls.push("tx.commit");
    return r;
  });
  t("db.findUnique", db.order.findUnique, async () => ({ ...baseOrder }));
  t("db.fulfillment.create", db.fulfillment.create, async ({ data }: { data: Record<string, unknown> }) => ({ id: "f_1", ...data }));
  t("db.orderItem.updateMany", db.orderItem.updateMany, async () => ({ count: 1 }));
  t("db.orderItem.findMany", db.orderItem.findMany, async () => [{ id: "oi_1", fulfillmentStatus: "fulfilled" }]);
  t("stripe.capture", stripe.paymentIntents.capture, async () => ({ id: "pi_1", status: "succeeded" }));
  t("db.update", db.order.update, async ({ data }: { data: Record<string, unknown> }) => ({ ...baseOrder, ...data }));
  t("magicLink.create", gprisma.magicLinkToken.create, async () => ({}));
});

describe("POST /api/admin/orders/[id]/fulfill", () => {
  it("fully fulfilled + authorized: tx (fulfillment + items), capture, order update, magic link, shipped email + log", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await POST(req("fulfill", body), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(["emailSent", "fulfillment", "paymentError"]);
    expect(json).toMatchObject({ paymentError: null, emailSent: true });
    expect(json.fulfillment).toMatchObject({ id: "f_1", orderId: "o1", tenantId: "tenant_a", trackingNumber: "9400 1", trackingUrl: null });
    expect(h.calls).toEqual([
      "db.findUnique",
      "tx.begin", "db.fulfillment.create", "db.orderItem.updateMany", "db.orderItem.findMany", "tx.commit",
      "stripe.capture", "db.update", "magicLink.create", "email.send", "email.log",
    ]);
    expect(db.orderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId: "o1", id: { in: ["oi_1"] } },
      data: { fulfillmentStatus: "fulfilled" },
    });
    expect(db.orderItem.update).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.capture).toHaveBeenCalledWith("pi_1", undefined, { idempotencyKey: "order_capture_o1" });
    expect(db.order.update.mock.calls[0][0]).toEqual({ where: { id: "o1" }, data: { status: "SHIPPED", financialStatus: "PAID" } });
    expect(gprisma.magicLinkToken.create.mock.calls[0][0].data).toMatchObject({ tenantId: "tenant_a", email: "c@x.test", type: "CUSTOMER" });
    expect(emails.send.mock.calls[0][0]).toMatchObject({ to: "c@x.test", subject: "Your order AS-1001 has shipped!", html: "<shipped/>" });
    expect(mail.logEmail.mock.calls[0][0]).toMatchObject({ type: "ORDER_SHIPPED", relatedId: "o1", resendId: "em_1" });
    logSpy.mockRestore();
  });

  it("notifyCustomer=false sends no email (no emailSent key); no tracking -> FULFILLED", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    db.order.findUnique.mockResolvedValueOnce({ ...baseOrder, financialStatus: "PAID" });
    const res = await POST(req("fulfill", { ...body, trackingNumber: "  ", notifyCustomer: false }), ctx);
    expect(res.status).toBe(200);
    expect(Object.keys(await res.json()).sort()).toEqual(["fulfillment", "paymentError"]);
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    expect(db.order.update.mock.calls[0][0].data).toEqual({ status: "FULFILLED", financialStatus: "PAID" });
    expect(emails.send).not.toHaveBeenCalled();
    expect(gprisma.magicLinkToken.create).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("partially fulfilled: no capture and no order status update, email still sent", async () => {
    db.order.findUnique.mockResolvedValueOnce({
      ...baseOrder,
      items: [...baseOrder.items, { id: "oi_2", title: "Cup", variantTitle: null, quantity: 1, productSnapshot: {}, fulfillmentStatus: null }],
    });
    db.orderItem.findMany.mockResolvedValueOnce([
      { id: "oi_1", fulfillmentStatus: "fulfilled" }, { id: "oi_2", fulfillmentStatus: null },
    ]);
    const res = await POST(req("fulfill", body), ctx);
    expect(res.status).toBe(200);
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    expect(db.order.update).not.toHaveBeenCalled();
    expect(emails.send).toHaveBeenCalledTimes(1);
  });

  it("capture failure does not block fulfillment: order status moves, financial status stays, paymentError reported", async () => {
    stripe.paymentIntents.capture.mockRejectedValueOnce(new Error("card expired"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req("fulfill", body), ctx);
    errSpy.mockRestore();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentError).toContain("card expired");
    expect(db.order.update.mock.calls[0][0].data).toEqual({ status: "SHIPPED", financialStatus: "AUTHORIZED" });
  });

  it("400 for an item id that is not on this order: nothing written, no capture", async () => {
    const res = await POST(req("fulfill", { ...body, items: [{ orderItemId: "oi_other", quantity: 1 }] }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not on this order: oi_other/);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.fulfillment.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
  });

  it("400 when no items are selected: nothing written", async () => {
    const res = await POST(req("fulfill", { ...body, items: [] }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Select at least one item to fulfill" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.fulfillment.create).not.toHaveBeenCalled();
  });

  it("404 for a missing order, nothing written", async () => {
    db.order.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req("fulfill", body), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found" });
    expect(db.fulfillment.create).not.toHaveBeenCalled();
  });
});
