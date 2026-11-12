import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ calls: [] as string[] }));

const db = vi.hoisted(() => {
  const d = {
    $tenantId: "tenant_a",
    order: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    customer: { findUnique: vi.fn() },
    fulfillment: { create: vi.fn() },
    orderItem: { update: vi.fn(), findMany: vi.fn() },
    returnItem: { findMany: vi.fn(async () => []) },
    inventory: { findMany: vi.fn(async () => [{ variantId: "v1", quantity: 4 }]), update: vi.fn(async () => ({ id: "inv1" })) },
    inventoryLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(),
  };
  // Interactive transaction: the callback runs against the same mocks.
  d.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(d));
  return d;
});
const stripe = vi.hoisted(() => ({
  paymentIntents: { retrieve: vi.fn(), cancel: vi.fn(), capture: vi.fn() },
  refunds: { create: vi.fn(), list: vi.fn(async () => ({ data: [] as unknown[] })) },
  charges: { retrieve: vi.fn() },
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
vi.mock("stripe", () => ({ default: class { paymentIntents = stripe.paymentIntents; refunds = stripe.refunds; charges = stripe.charges; } }));
vi.mock("resend", () => ({ Resend: class { emails = emails; } }));
vi.mock("@/lib/email-branding", () => ({ getEmailBranding: mail.getEmailBranding, emailLogoHtml: () => "<logo/>" }));
vi.mock("@/lib/email-log", () => ({ logEmail: mail.logEmail }));
vi.mock("@/lib/emails/order-cancelled", () => ({ orderCancelledHtml: () => "<cancelled/>" }));
vi.mock("@/lib/emails/order-shipped", () => ({ orderShippedHtml: () => "<shipped/>" }));
vi.mock("@/lib/emails/order-confirmation", () => ({ orderConfirmationHtml: () => "<confirm/>" }));
vi.mock("@/lib/tracking", () => ({ checkTracking: vi.fn() }));

import { POST } from "@/app/api/admin/orders/[id]/cancel/route";

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

const VERSION = new Date("2026-01-01T00:00:00Z");
const baseOrder = {
  id: "o1", orderNumber: "AS-1001", email: "c@x.test", total: 5000, status: "PROCESSING",
  financialStatus: "PAID", stripePaymentIntentId: "pi_1", customerId: "cu_1", adminNote: null,
  stripeCheckoutSessionId: null, updatedAt: VERSION,
  items: [{ id: "oi1", title: "Mug", variantTitle: null, variantId: "v1", quantity: 1, total: 5000, fulfillmentStatus: null }],
};

// What the conditional updateMany wrote; findUniqueOrThrow reads it back.
let written: Record<string, unknown> = {};

beforeEach(() => {
  resetCommon();
  written = {};
  t("db.findUnique", db.order.findUnique, async () => ({ ...baseOrder }));
  t("db.updateMany", db.order.updateMany, async ({ data }: { data: Record<string, unknown> }) => {
    written = data;
    return { count: 1 };
  });
  t("db.findUniqueOrThrow", db.order.findUniqueOrThrow, async () => ({ ...baseOrder, ...written }));
  t("db.customer", db.customer.findUnique, async () => ({ firstName: "Ana" }));
  t("stripe.list", stripe.refunds.list, async () => ({ data: [] }));
  t("stripe.retrieve", stripe.paymentIntents.retrieve, async () => ({ latest_charge: { id: "ch_1", amount: 5000, amount_refunded: 0 } }));
  t("stripe.refund", stripe.refunds.create, async ({ amount }: { amount: number }) => ({ id: "re_1", amount }));
  t("db.tx", db.$transaction, async (fn: (tx: unknown) => unknown) => fn(db));
  t("inv.update", db.inventory.update, async () => ({ id: "inv1" }));
  t("stripe.cancel", stripe.paymentIntents.cancel, async () => ({ id: "pi_1" }));
});

describe("POST /api/admin/orders/[id]/cancel", () => {
  it("PAID order: reads the balance, refunds it (versioned key), THEN one transaction (claim + restock), then email + log", async () => {
    const res = await POST(req("cancel", { reason: "customer asked" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ refunded: true, refundedAmount: 5000, stripeRefundId: "re_1", paymentError: null, emailSent: true });
    expect(json.order).toMatchObject({ id: "o1", status: "CANCELLED", financialStatus: "REFUNDED", cancelReason: "customer asked" });
    expect(h.calls).toEqual([
      "db.findUnique", "stripe.list", "stripe.retrieve", "stripe.refund",
      "db.tx", "db.updateMany", "inv.update", "db.findUniqueOrThrow",
      "db.customer", "email.send", "email.log",
    ]);
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", amount: 5000, reason: "requested_by_customer", metadata: { orderId: "o1", cancel: "true" } },
      { idempotencyKey: `order_cancel_o1_refund_${VERSION.getTime()}` },
    );
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", status: { notIn: ["CANCELLED", "REFUNDED", "DELIVERED"] } },
      data: expect.objectContaining({ status: "CANCELLED", financialStatus: "REFUNDED", cancelReason: "customer asked" }),
    });
    expect(db.inventory.update).toHaveBeenCalledWith({ where: { variantId: "v1" }, data: { quantity: { increment: 1 } } });
    expect(db.order.update).not.toHaveBeenCalled();
    expect(emails.send.mock.calls[0][0]).toMatchObject({ to: "c@x.test", subject: "Your order AS-1001 has been cancelled" });
    expect(mail.logEmail.mock.calls[0][0]).toMatchObject({ type: "ORDER_REFUNDED", relatedId: "o1", resendId: "em_1" });
  });

  it("AUTHORIZED order: voids the hold first (versioned key), then cancels; logs ORDER_CANCELLED", async () => {
    db.order.findUnique.mockResolvedValueOnce({ ...baseOrder, financialStatus: "AUTHORIZED" });
    const res = await POST(req("cancel", { reason: "" }), ctx);
    const json = await res.json();
    expect(json.refunded).toBe(false);
    expect(json.paymentError).toBeNull();
    expect(json.order.financialStatus).toBe("VOIDED");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_1", undefined, { idempotencyKey: `order_cancel_o1_void_${VERSION.getTime()}` });
    expect(h.calls.indexOf("stripe.cancel")).toBeLessThan(h.calls.indexOf("db.tx"));
    expect(mail.logEmail.mock.calls[0][0].type).toBe("ORDER_CANCELLED");
  });

  it("PENDING (unpaid) order: best-effort release after nothing else depends on it", async () => {
    db.order.findUnique.mockResolvedValueOnce({ ...baseOrder, financialStatus: "PENDING" });
    const json = await (await POST(req("cancel", { reason: "x" }), ctx)).json();
    expect(json.order.financialStatus).toBe("VOIDED");
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_1", undefined, { idempotencyKey: "order_cancel_o1_void" });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("Stripe refund failure: 502 blocked + retrySafe, no transaction, no email; the attempt is noted on the order", async () => {
    stripe.refunds.create.mockRejectedValueOnce(new Error("stripe down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req("cancel", { reason: "x" }), ctx);
    errSpy.mockRestore();
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json).toMatchObject({ done: false, blocked: true, retrySafe: true, moneyMoved: false });
    expect(json.error).toContain("stripe down");
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.inventory.update).not.toHaveBeenCalled();
    expect(emails.send).not.toHaveBeenCalled();
    // Only the note is written (it also moves the version for the retry's new key).
    expect(db.order.updateMany).toHaveBeenCalledTimes(1);
    expect(db.order.updateMany.mock.calls[0][0].data).toEqual({ adminNote: expect.stringContaining("Cancel attempt failed") });
  });

  it("409 when a concurrent request already cancelled it: no email", async () => {
    db.order.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await POST(req("cancel", { reason: "x" }), ctx);
    expect(res.status).toBe(409);
    expect(db.order.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(db.inventory.update).not.toHaveBeenCalled();
    expect(emails.send).not.toHaveBeenCalled();
  });

  it("email failure (Resend {error}) still cancels, emailSent:false, nothing logged", async () => {
    emails.send.mockResolvedValueOnce({ data: null, error: { message: "bad from" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req("cancel", { reason: "x" }), ctx);
    errSpy.mockRestore();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ refunded: true, emailSent: false, order: { status: "CANCELLED" } });
    expect(mail.logEmail).not.toHaveBeenCalled();
  });

  it("400 when already cancelled, with no Stripe call or update", async () => {
    db.order.findUnique.mockResolvedValueOnce({ ...baseOrder, status: "CANCELLED" });
    const res = await POST(req("cancel", { reason: "x" }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Order is already cancelled or refunded" });
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it("404 for a missing order", async () => {
    db.order.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req("cancel", { reason: "x" }), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found" });
  });

  it("401 with no admin session: no Stripe call, no DB work", async () => {
    const { TenantResolutionError } = await import("../helpers/tenant-context-mock");
    auth.getTenantPrismaForAdmin.mockRejectedValueOnce(new TenantResolutionError("No admin session"));
    const res = await POST(req("cancel", { reason: "x" }), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });
});
