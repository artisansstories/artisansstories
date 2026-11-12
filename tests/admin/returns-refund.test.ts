import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Shared, ordered log of every side effect so we can assert sequencing.
const calls: string[] = [];

// ── auth / tenant ────────────────────────────────────────────────────────────
const getAdminSession = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  getAdminSession: (...a: unknown[]) => getAdminSession(...a),
}));

// Mirrors the real chain: getTenantPrismaForAdmin resolves the tenant from the
// admin session and throws TenantResolutionError when there is none.
const db = {
  $tenantId: "tenant_a",
  return: { findUnique: vi.fn(), update: vi.fn() },
  order: { update: vi.fn() },
  inventory: { update: vi.fn() },
};
vi.mock("@/lib/tenant-context", () => {
  class TenantResolutionError extends Error {
    readonly status = 401;
  }
  return {
    TenantResolutionError,
    getTenantPrismaForAdmin: async () => {
      const s = await getAdminSession();
      if (!s?.tenantId) throw new TenantResolutionError("No admin session");
      return db;
    },
  };
});

// ── stripe ───────────────────────────────────────────────────────────────────
const piRetrieve = vi.fn();
const refundCreate = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { retrieve: (...a: unknown[]) => piRetrieve(...a) };
    refunds = { create: (...a: unknown[]) => refundCreate(...a) };
  },
}));

// ── email senders ────────────────────────────────────────────────────────────
const resendSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => resendSend(...a) };
  },
}));
const logEmail = vi.fn();
vi.mock("@/lib/email-log", () => ({ logEmail: (...a: unknown[]) => logEmail(...a) }));
vi.mock("@/lib/email-branding", () => ({
  getEmailBranding: async () => {
    calls.push("email.branding");
    return {
      storeName: "Test Store",
      from: "Test Store <hello@test.store>",
      fromAddress: "hello@test.store",
      replyTo: null,
      accentColor: "#000",
    };
  },
  emailLogoHtml: () => "",
}));
vi.mock("@/lib/emails/refund-issued", () => ({ refundIssuedHtml: () => "<p>refund</p>" }));
vi.mock("@/lib/emails/return-approved", () => ({ returnApprovedHtml: () => "" }));
vi.mock("@/lib/emails/return-rejected", () => ({ returnRejectedHtml: () => "" }));

import { POST } from "@/app/api/admin/returns/[id]/refund/route";
import { proxy } from "@/proxy";

const SESSION = { id: "admin_1", email: "a@test.store", name: "A", role: "ADMIN", tenantId: "tenant_a" };

function makeReturn(over: { total?: number; pi?: string | null } = {}) {
  return {
    id: "ret_1",
    status: "RECEIVED",
    stripeRefundId: null,
    refundAmount: null,
    order: {
      id: "ord_1",
      orderNumber: "AS-1001",
      email: "buyer@example.com",
      total: over.total ?? 5000,
      stripePaymentIntentId: over.pi === undefined ? "pi_123" : over.pi,
      financialStatus: "PAID",
    },
    items: [
      { id: "ri_1", quantity: 2, orderItem: { id: "oi_1", title: "Bowl", variantTitle: "Blue", variantId: "var_1" } },
      { id: "ri_2", quantity: 1, orderItem: { id: "oi_2", title: "Card", variantTitle: null, variantId: null } },
    ],
  };
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/returns/ret_1/refund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "ret_1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  getAdminSession.mockResolvedValue(SESSION);
  db.return.findUnique.mockImplementation(async () => {
    calls.push("db.return.findUnique");
    return makeReturn();
  });
  db.return.update.mockImplementation(async (a: { data: Record<string, unknown> }) => {
    calls.push("db.return.update");
    return { id: "ret_1", status: "REFUNDED", refundAmount: a.data.refundAmount, stripeRefundId: a.data.stripeRefundId };
  });
  db.order.update.mockImplementation(async () => {
    calls.push("db.order.update");
    return {};
  });
  db.inventory.update.mockImplementation(async () => {
    calls.push("db.inventory.update");
    return {};
  });
  piRetrieve.mockImplementation(async () => {
    calls.push("stripe.paymentIntents.retrieve");
    return { latest_charge: "ch_123" };
  });
  refundCreate.mockImplementation(async () => {
    calls.push("stripe.refunds.create");
    return { id: "re_123" };
  });
  resendSend.mockImplementation(async () => {
    calls.push("email.send");
    return { data: { id: "email_1" } };
  });
  logEmail.mockImplementation(async () => {
    calls.push("email.log");
  });
});

describe("POST /api/admin/returns/[id]/refund", () => {
  it("full refund with restock: 200, { return }, Stripe -> DB + restock -> email", async () => {
    const res = await POST(req({ amount: 5000, restock: true }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json)).toEqual(["return"]);
    expect(json.return).toEqual({ id: "ret_1", status: "REFUNDED", refundAmount: 5000, stripeRefundId: "re_123" });

    expect(calls).toEqual([
      "db.return.findUnique",
      "stripe.paymentIntents.retrieve",
      "stripe.refunds.create",
      "db.return.update",
      "db.order.update",
      "db.inventory.update",
      "email.branding",
      "email.send",
      "email.log",
    ]);

    expect(piRetrieve).toHaveBeenCalledWith("pi_123");
    // Routes never pass an idempotency key, so request options stay undefined.
    expect(refundCreate).toHaveBeenCalledWith({ charge: "ch_123", amount: 5000 }, undefined);

    const retData = db.return.update.mock.calls[0][0];
    expect(retData.where).toEqual({ id: "ret_1" });
    expect(retData.data).toMatchObject({ status: "REFUNDED", refundAmount: 5000, stripeRefundId: "re_123", restockItems: true });
    expect(retData.data.resolvedAt).toBeInstanceOf(Date);
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: { financialStatus: "REFUNDED", status: "REFUNDED" },
    });
    // Only the line with a variant is restocked.
    expect(db.inventory.update).toHaveBeenCalledTimes(1);
    expect(db.inventory.update).toHaveBeenCalledWith({
      where: { variantId: "var_1" },
      data: { quantity: { increment: 2 } },
    });

    expect(resendSend).toHaveBeenCalledWith(expect.objectContaining({
      to: "buyer@example.com",
      replyTo: "hello@test.store",
      subject: "Your refund has been issued — Test Store",
    }));
    expect(logEmail).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant_a",
      type: "REFUND_ISSUED",
      resendId: "email_1",
      relatedId: "ret_1",
      relatedType: "RETURN",
    }));
  });

  it("partial refund without restock keeps order status and skips inventory", async () => {
    const res = await POST(req({ amount: 1000, restock: false }), params);
    expect(res.status).toBe(200);
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: { financialStatus: "PARTIALLY_REFUNDED" },
    });
    expect(db.inventory.update).not.toHaveBeenCalled();
    expect(calls).toEqual([
      "db.return.findUnique",
      "stripe.paymentIntents.retrieve",
      "stripe.refunds.create",
      "db.return.update",
      "db.order.update",
      "email.branding",
      "email.send",
      "email.log",
    ]);
  });

  it("amount 0 or no payment intent: no Stripe call, stripeRefundId null", async () => {
    const res = await POST(req({ amount: 0, restock: false }), params);
    expect(res.status).toBe(200);
    expect(piRetrieve).not.toHaveBeenCalled();
    expect(refundCreate).not.toHaveBeenCalled();
    expect(db.return.update.mock.calls[0][0].data.stripeRefundId).toBeNull();

    db.return.findUnique.mockResolvedValueOnce(makeReturn({ pi: null }));
    const res2 = await POST(req({ amount: 5000, restock: false }), params);
    expect(res2.status).toBe(200);
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("validation and not-found branches return the main-branch errors with no side effects", async () => {
    let res = await POST(req({ amount: -1, restock: false }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid refund amount" });
    expect(db.return.findUnique).not.toHaveBeenCalled();

    res = await POST(req({ restock: false }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid refund amount" });

    db.return.findUnique.mockResolvedValueOnce(null);
    res = await POST(req({ amount: 100, restock: false }), params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Return not found" });

    res = await POST(req({ amount: 5001, restock: false }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Refund amount cannot exceed order total" });

    expect(piRetrieve).not.toHaveBeenCalled();
    expect(refundCreate).not.toHaveBeenCalled();
    expect(db.return.update).not.toHaveBeenCalled();
    expect(db.order.update).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("Stripe failure: 500 Server error, no DB writes, no email", async () => {
    refundCreate.mockRejectedValueOnce(new Error("card_declined"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ amount: 5000, restock: true }), params);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server error" });
    expect(db.return.update).not.toHaveBeenCalled();
    expect(db.order.update).not.toHaveBeenCalled();
    expect(db.inventory.update).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  describe("no session", () => {
    it("is rejected with 401 by the /api/admin proxy before reaching the route", async () => {
      const r = new NextRequest("http://localhost/api/admin/returns/ret_1/refund", {
        method: "POST",
        headers: { host: "localhost", "content-type": "application/json" },
        body: JSON.stringify({ amount: 5000, restock: true }),
      });
      const res = await proxy(r);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(piRetrieve).not.toHaveBeenCalled();
      expect(refundCreate).not.toHaveBeenCalled();
    });

    it("rejects an invalid session cookie with 401 at the proxy", async () => {
      const r = new NextRequest("http://localhost/api/admin/returns/ret_1/refund", {
        method: "POST",
        headers: { host: "localhost", cookie: "as-admin-session=not-a-jwt" },
      });
      const res = await proxy(r);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("route itself (proxy bypassed) touches nothing and never calls Stripe; status matches main (500)", async () => {
      getAdminSession.mockResolvedValue(null);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(req({ amount: 5000, restock: true }), params);
      spy.mockRestore();
      // main has no in-route session check for returns: the TenantResolutionError
      // from getTenantPrismaForAdmin falls into the catch-all. Kept for parity.
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Server error" });
      expect(db.return.findUnique).not.toHaveBeenCalled();
      expect(piRetrieve).not.toHaveBeenCalled();
      expect(refundCreate).not.toHaveBeenCalled();
      expect(db.return.update).not.toHaveBeenCalled();
      expect(resendSend).not.toHaveBeenCalled();
    });
  });
});
