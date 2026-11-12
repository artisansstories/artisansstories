import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ calls: [] as string[] }));

const db = vi.hoisted(() => ({
  $tenantId: "tenant_a",
  order: { findUnique: vi.fn(), update: vi.fn() },
  customer: { findUnique: vi.fn() },
  fulfillment: { create: vi.fn() },
  orderItem: { update: vi.fn(), findMany: vi.fn() },
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

const baseOrder = {
  id: "o1", orderNumber: "AS-1001", email: "c@x.test", total: 5000, status: "PAID",
  financialStatus: "PAID", stripePaymentIntentId: "pi_1", customerId: "cu_1",
};

beforeEach(() => {
  resetCommon();
  t("db.findUnique", db.order.findUnique, async () => ({ ...baseOrder }));
  t("db.update", db.order.update, async ({ data }: { data: Record<string, unknown> }) => ({ ...baseOrder, ...data }));
  t("db.customer", db.customer.findUnique, async () => ({ firstName: "Ana" }));
  t("stripe.retrieve", stripe.paymentIntents.retrieve, async () => ({ latest_charge: "ch_1" }));
  t("stripe.refund", stripe.refunds.create, async () => ({ id: "re_1" }));
  t("stripe.cancel", stripe.paymentIntents.cancel, async () => ({ id: "pi_1" }));
});

describe("POST /api/admin/orders/[id]/cancel", () => {
  it("PAID order: Stripe refund, then DB update, then email + log (ORDER_REFUNDED)", async () => {
    const res = await POST(req("cancel", { reason: "customer asked" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(["order", "refunded"]);
    expect(json.refunded).toBe(true);
    expect(json.order).toMatchObject({ id: "o1", status: "CANCELLED", financialStatus: "REFUNDED", cancelReason: "customer asked" });
    expect(h.calls).toEqual([
      "db.findUnique", "stripe.retrieve", "stripe.refund", "db.update", "db.customer", "email.send", "email.log",
    ]);
    expect(stripe.refunds.create.mock.calls[0][0]).toEqual({ charge: "ch_1", reason: "requested_by_customer" });
    expect(emails.send.mock.calls[0][0]).toMatchObject({ to: "c@x.test", subject: "Your order AS-1001 has been cancelled" });
    expect(mail.logEmail.mock.calls[0][0]).toMatchObject({ type: "ORDER_REFUNDED", relatedId: "o1", resendId: "em_1" });
  });

  it("AUTHORIZED order: voids the hold (no refund) and logs ORDER_CANCELLED", async () => {
    db.order.findUnique.mockResolvedValueOnce({ ...baseOrder, financialStatus: "AUTHORIZED" });
    const res = await POST(req("cancel", { reason: "" }), ctx);
    const json = await res.json();
    expect(json.refunded).toBe(false);
    expect(json.order.financialStatus).toBe("VOIDED");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel.mock.calls[0][0]).toBe("pi_1");
    expect(h.calls.indexOf("stripe.cancel")).toBeLessThan(h.calls.indexOf("db.update"));
    expect(mail.logEmail.mock.calls[0][0].type).toBe("ORDER_CANCELLED");
  });

  it("Stripe failure still cancels the order with the old financial status", async () => {
    stripe.refunds.create.mockRejectedValueOnce(new Error("stripe down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req("cancel", { reason: "x" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ refunded: false, order: { status: "CANCELLED", financialStatus: "PAID" } });
    errSpy.mockRestore();
  });

  it("400 when already cancelled, with no Stripe call or update", async () => {
    db.order.findUnique.mockResolvedValueOnce({ ...baseOrder, status: "CANCELLED" });
    const res = await POST(req("cancel", { reason: "x" }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Order is already cancelled or refunded" });
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("404 for a missing order", async () => {
    db.order.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req("cancel", { reason: "x" }), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found" });
  });
});
