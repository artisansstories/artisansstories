import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ calls: [] as string[] }));

const db = vi.hoisted(() => ({
  $tenantId: "tenant_a",
  order: { findUnique: vi.fn(), update: vi.fn() },
}));
const stripe = vi.hoisted(() => ({
  paymentIntents: { retrieve: vi.fn(), cancel: vi.fn(), capture: vi.fn() },
  refunds: { create: vi.fn() },
}));
const emails = vi.hoisted(() => ({ send: vi.fn() }));
const auth = vi.hoisted(() => ({ getAdminSession: vi.fn(), getTenantPrismaForAdmin: vi.fn() }));
const mail = vi.hoisted(() => ({ logEmail: vi.fn(), getEmailBranding: vi.fn() }));

vi.mock("@/lib/admin-auth", () => ({ getAdminSession: auth.getAdminSession }));
vi.mock("@/lib/tenant-context", () => ({ getTenantPrismaForAdmin: auth.getTenantPrismaForAdmin }));
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
const paidOrder = {
  id: "o1", orderNumber: "AS-1001", email: "c@x.test", total: 5000, status: "DELIVERED",
  financialStatus: "PAID", stripePaymentIntentId: "pi_1", adminNote: null,
};

function call(body: unknown) {
  const req = new NextRequest("http://localhost/api/admin/orders/o1/refund", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });
  return POST(req, { params: Promise.resolve({ id: "o1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.calls.length = 0;
  const t = (label: string, fn: ReturnType<typeof vi.fn>, impl: (...a: never[]) => unknown) =>
    fn.mockImplementation((...a: never[]) => { h.calls.push(label); return impl(...a); });
  auth.getTenantPrismaForAdmin.mockResolvedValue(db);
  auth.getAdminSession.mockResolvedValue({ adminId: "a1", role: "OWNER" });
  t("db.findUnique", db.order.findUnique, async () => ({ ...paidOrder }));
  t("db.update", db.order.update, async ({ data }: { data: Record<string, unknown> }) => ({ ...paidOrder, ...data }));
  t("stripe.retrieve", stripe.paymentIntents.retrieve, async () => ({ latest_charge: "ch_1" }));
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
    expect(db.order.update).not.toHaveBeenCalled();
    expect(emails.send).not.toHaveBeenCalled();
  });

  it("full refund: Stripe refund, then DB update, then email + log", async () => {
    const res = await call({ reason: "damaged" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, refundId: "re_1", amount: 5000, status: "succeeded" });
    expect(h.calls).toEqual(["db.findUnique", "stripe.retrieve", "stripe.refund", "db.update", "email.send", "email.log"]);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ charge: "ch_1", reason: "requested_by_customer" }, undefined);
    const data = db.order.update.mock.calls[0][0].data;
    expect(data.financialStatus).toBe("REFUNDED");
    expect(data.status).toBe("REFUNDED");
    expect(data.adminNote).toMatch(/^Refund issued: damaged \(/);
    expect(emails.send.mock.calls[0][0]).toMatchObject({ to: "c@x.test", subject: "Refund issued for order AS-1001" });
    expect(mail.logEmail.mock.calls[0][0]).toMatchObject({ type: "ORDER_REFUNDED", resendId: "em_1", relatedId: "o1" });
  });

  it("partial refund keeps order status and marks PARTIALLY_REFUNDED", async () => {
    const res = await call({ amount: 1500 });
    expect(await res.json()).toMatchObject({ success: true, amount: 1500 });
    expect(stripe.refunds.create.mock.calls[0][0]).toEqual({ charge: "ch_1", amount: 1500, reason: "requested_by_customer" });
    const data = db.order.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ financialStatus: "PARTIALLY_REFUNDED", status: "DELIVERED" });
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

  it("Stripe failure surfaces its message as a 500 and the order is not updated", async () => {
    stripe.refunds.create.mockRejectedValueOnce(new Error("Charge already refunded"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Charge already refunded" });
    expect(db.order.update).not.toHaveBeenCalled();
    expect(emails.send).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("email failure does not fail the refund", async () => {
    emails.send.mockRejectedValueOnce(new Error("resend down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({});
    expect(res.status).toBe(200);
    expect(db.order.update).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
