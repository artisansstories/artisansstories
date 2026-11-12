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

import { POST } from "@/app/api/admin/orders/[id]/resend-email/route";

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
  id: "o1", orderNumber: "AS-1001", email: "c@x.test", subtotal: 4000, shippingTotal: 500, taxTotal: 500,
  discountTotal: 0, total: 5000, shippingAddress: { firstName: "Ana", city: "SS" },
  items: [{ title: "Bowl", variantTitle: null, quantity: 1, price: 4000, total: 4000, productSnapshot: {} }],
};

beforeEach(() => {
  resetCommon();
  t("db.findUnique", db.order.findUnique, async () => ({ ...baseOrder }));
  mail.getEmailBranding.mockImplementation(async () => { h.calls.push("branding"); return branding; });
});

describe("POST /api/admin/orders/[id]/resend-email", () => {
  it("sends the confirmation then logs it, returns { ok: true }", async () => {
    const res = await POST(req("resend-email"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.order.findUnique).toHaveBeenCalledWith({ where: { id: "o1" }, include: { items: true } });
    expect(h.calls).toEqual(["db.findUnique", "branding", "email.send", "email.log"]);
    expect(emails.send.mock.calls[0][0]).toEqual({
      from: branding.from, to: "c@x.test", replyTo: "s@x.test", subject: "Order Confirmed — AS-1001", html: "<confirm/>",
    });
    expect(mail.logEmail.mock.calls[0][0]).toMatchObject({
      tenantId: "tenant_a", type: "ORDER_CONFIRMATION", toEmail: "c@x.test", resendId: "em_1", relatedId: "o1", relatedType: "ORDER",
    });
  });

  it("404 for a missing order, no email", async () => {
    db.order.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req("resend-email"), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found" });
    expect(emails.send).not.toHaveBeenCalled();
  });

  it("Resend {error} result is a 502 with the provider message and nothing is logged", async () => {
    emails.send.mockResolvedValueOnce({ data: null, error: { message: "domain not verified" } });
    const res = await POST(req("resend-email"), ctx);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "The email provider rejected the confirmation email: domain not verified" });
    expect(mail.logEmail).not.toHaveBeenCalled();
  });

  it("send failure is a 500 'Server error' and nothing is logged", async () => {
    emails.send.mockRejectedValueOnce(new Error("resend down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req("resend-email"), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server error" });
    expect(mail.logEmail).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("401 (not 500) when the admin session cannot be resolved, no email", async () => {
    const { TenantResolutionError } = await import("../helpers/tenant-context-mock");
    auth.getTenantPrismaForAdmin.mockRejectedValueOnce(new TenantResolutionError("No admin session"));
    const res = await POST(req("resend-email"), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(db.order.findUnique).not.toHaveBeenCalled();
    expect(emails.send).not.toHaveBeenCalled();
  });
});
