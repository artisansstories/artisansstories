/**
 * Returns domain (non-refund): list, get, admin note, approve, reject, receive,
 * raw status. Every route + method and every MCP tool, with the DB effect read
 * back through the read path a human (GET returns/[id]) or agent (returns_get)
 * would use. Refunds live in returns-refund.test.ts.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import { resendState, sentTo, stripeState } from "../helpers/fakes";
import * as list from "@/app/api/admin/returns/route";
import * as one from "@/app/api/admin/returns/[id]/route";
import * as approve from "@/app/api/admin/returns/[id]/approve/route";
import * as reject from "@/app/api/admin/returns/[id]/reject/route";
import * as receive from "@/app/api/admin/returns/[id]/receive/route";
import * as status from "@/app/api/admin/returns/[id]/status/route";

const H = (fn: unknown) => fn as never;

/** Everything a return write could touch, for "nothing changed" checks. */
async function snapshot() {
  return {
    returns: await prisma.return.findMany({ orderBy: { id: "asc" } }),
    orders: await prisma.order.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, financialStatus: true } }),
    inventory: await prisma.inventory.findMany({ orderBy: { id: "asc" } }),
    invLogs: await prisma.inventoryLog.count(),
    emailLogs: await prisma.emailLog.count(),
    sent: resendState.sent.length,
    stripeWrites: stripeState.calls.filter((c) => c.method !== "paymentIntents.retrieve" && c.method !== "charges.retrieve" && c.method !== "refunds.list").length,
  };
}

async function getViaRoute(id: string) {
  const r = await call(H(one.GET), "GET", `/api/admin/returns/${id}`, { params: { id } });
  expect(r.status).toBe(200);
  return r.body.return;
}

async function withMcp<T>(key: string, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const mcp = await connectMcp(key);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}

// ── auth: every route + method without a session ───────────────────────────

describe("returns routes: no session → 401", () => {
  const id = F.ret.requested;
  const cases: [string, () => Promise<{ status: number }>][] = [
    ["GET /returns", () => call(H(list.GET), "GET", "/api/admin/returns")],
    ["GET /returns/[id]", () => call(H(one.GET), "GET", `/api/admin/returns/${id}`, { params: { id } })],
    ["PUT /returns/[id]", () => call(H(one.PUT), "PUT", `/api/admin/returns/${id}`, { params: { id }, body: { adminNote: "x" } })],
    ["POST approve", () => call(H(approve.POST), "POST", `/api/admin/returns/${id}/approve`, { params: { id } })],
    ["POST reject", () => call(H(reject.POST), "POST", `/api/admin/returns/${id}/reject`, { params: { id }, body: { reason: "x" } })],
    ["POST receive", () => call(H(receive.POST), "POST", `/api/admin/returns/${F.ret.approved}/receive`, { params: { id: F.ret.approved } })],
    ["PATCH status", () => call(H(status.PATCH), "PATCH", `/api/admin/returns/${id}/status`, { params: { id }, body: { status: "APPROVED" } })],
  ];
  for (const [name, run] of cases) {
    it(name, async () => {
      const before = await snapshot();
      const r = await run();
      expect(r.status).toBe(401);
      expect(await snapshot()).toEqual(before);
    });
  }
});

// ── list ────────────────────────────────────────────────────────────────────

describe("GET /api/admin/returns", () => {
  it("lists this tenant's returns newest first with order + items", async () => {
    await signInAs(F.admin.super);
    const r = await call(H(list.GET), "GET", "/api/admin/returns");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(5);
    expect(r.body.page).toBe(1);
    expect(r.body.totalPages).toBe(1);
    const ids = r.body.returns.map((x: { id: string }) => x.id);
    // requestedAt desc: requested 1d, approved 2d, rejected 3d, received 4d, refunded 6d
    expect(ids).toEqual([F.ret.requested, F.ret.approved, F.ret.rejected, F.ret.received, F.ret.refunded]);
    expect(ids).not.toContain(F.ret.other);
    const received = r.body.returns.find((x: { id: string }) => x.id === F.ret.received);
    expect(received.order).toMatchObject({ id: F.order.paidReturn, orderNumber: "AS-1005", email: "ana@example.test", total: 15500, customer: { id: F.cust.ana } });
    expect(received.items).toHaveLength(2);
    expect(received.items.map((i: { orderItem: { title: string } }) => i.orderItem.title).sort()).toEqual(["Clay Mug", "Woven Hammock"]);
  });

  it("filters by status and paginates; an unknown status is ignored", async () => {
    await signInAs(F.admin.super);
    const f = await call(H(list.GET), "GET", "/api/admin/returns", { query: { status: "RECEIVED" } });
    expect(f.status).toBe(200);
    expect(f.body.total).toBe(1);
    expect(f.body.returns[0].id).toBe(F.ret.received);

    const p = await call(H(list.GET), "GET", "/api/admin/returns", { query: { limit: "2", page: "3" } });
    expect(p.body).toMatchObject({ total: 5, page: 3, totalPages: 3 });
    expect(p.body.returns.map((x: { id: string }) => x.id)).toEqual([F.ret.refunded]);

    const bogus = await call(H(list.GET), "GET", "/api/admin/returns", { query: { status: "NOPE" } });
    expect(bogus.status).toBe(200);
    expect(bogus.body.total).toBe(5);
  });

  it("the other store's admin sees only its own return", async () => {
    await signInAs(F.admin.oSuper);
    const r = await call(H(list.GET), "GET", "/api/admin/returns");
    expect(r.status).toBe(200);
    expect(r.body.returns.map((x: { id: string }) => x.id)).toEqual([F.ret.other]);
  });
});

// ── get one ─────────────────────────────────────────────────────────────────

describe("GET /api/admin/returns/[id]", () => {
  it("returns the return with order and items", async () => {
    await signInAs(F.admin.super);
    const ret = await getViaRoute(F.ret.received);
    expect(ret).toMatchObject({ id: F.ret.received, status: "RECEIVED", orderId: F.order.paidReturn });
    expect(ret.order).toMatchObject({ orderNumber: "AS-1005", total: 15500, financialStatus: "PAID", stripePaymentIntentId: "pi_paid_return", customer: { email: "ana@example.test" } });
    const mug = ret.items.find((i: { orderItemId: string }) => i.orderItemId === F.orderItem.paidReturnMug);
    expect(mug).toMatchObject({ quantity: 1, reason: "DEFECTIVE", orderItem: { variantId: F.variant.mug, price: 3500 } });
  });

  it("unknown id and another tenant's id are 404", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.ret.other]) {
      const r = await call(H(one.GET), "GET", `/api/admin/returns/${id}`, { params: { id } });
      expect(r.status).toBe(404);
      expect(r.body.error).toBe("Return not found");
    }
  });
});

// ── admin note ──────────────────────────────────────────────────────────────

describe("PUT /api/admin/returns/[id] (admin note)", () => {
  it("replaces the note, visible on GET, sends no email", async () => {
    await signInAs(F.admin.super);
    const r = await call(H(one.PUT), "PUT", `/api/admin/returns/${F.ret.rejected}`, { params: { id: F.ret.rejected }, body: { adminNote: "Called the customer" } });
    expect(r.status).toBe(200);
    expect(r.body.return).toMatchObject({ id: F.ret.rejected, adminNote: "Called the customer", status: "REJECTED" });
    expect((await getViaRoute(F.ret.rejected)).adminNote).toBe("Called the customer");
    expect(resendState.sent).toHaveLength(0);
  });

  it("unknown id and another tenant's id are 404 (not 500), nothing changes", async () => {
    await signInAs(F.admin.super);
    const before = await snapshot();
    for (const id of ["nope", F.ret.other]) {
      const r = await call(H(one.PUT), "PUT", `/api/admin/returns/${id}`, { params: { id }, body: { adminNote: "hijack" } });
      expect(r.status).toBe(404);
    }
    expect(await snapshot()).toEqual(before);
  });
});

// ── approve ─────────────────────────────────────────────────────────────────

describe("POST /api/admin/returns/[id]/approve", () => {
  it("REQUESTED → APPROVED, emails the customer once and logs it", async () => {
    await signInAs(F.admin.super);
    const r = await call(H(approve.POST), "POST", `/api/admin/returns/${F.ret.requested}/approve`, { params: { id: F.ret.requested } });
    expect(r.status).toBe(200);
    expect(r.body.return).toMatchObject({ id: F.ret.requested, status: "APPROVED" });
    expect((await getViaRoute(F.ret.requested)).status).toBe("APPROVED");
    const mails = sentTo("ana@example.test");
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("Your return has been approved — Artisans' Stories");
    expect(mails[0].html).toContain("AS-1009");
    const logs = await prisma.emailLog.findMany({ where: { relatedId: F.ret.requested } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ tenantId: HOUSE, type: "RETURN_APPROVED", toEmail: "ana@example.test", relatedType: "RETURN" });
    expect(stripeState.calls).toHaveLength(0);
  });

  it("a Resend failure keeps the approval but is not logged as a sent email", async () => {
    await signInAs(F.admin.super);
    resendState.failNext = "resend down";
    const r = await call(H(approve.POST), "POST", `/api/admin/returns/${F.ret.requested}/approve`, { params: { id: F.ret.requested } });
    expect(r.status).toBe(200);
    expect((await getViaRoute(F.ret.requested)).status).toBe("APPROVED");
    expect(resendState.sent).toHaveLength(0);
    expect(await prisma.emailLog.count({ where: { relatedId: F.ret.requested } })).toBe(0);
  });

  it("a non-REQUESTED return is 400 with no change and no email", async () => {
    await signInAs(F.admin.super);
    const before = await snapshot();
    for (const id of [F.ret.approved, F.ret.rejected, F.ret.received, F.ret.refunded]) {
      const r = await call(H(approve.POST), "POST", `/api/admin/returns/${id}/approve`, { params: { id } });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("Return is not in REQUESTED status");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("unknown / other-tenant id is 404", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.ret.other]) {
      const r = await call(H(approve.POST), "POST", `/api/admin/returns/${id}/approve`, { params: { id } });
      expect(r.status).toBe(404);
    }
    expect((await prisma.return.findUnique({ where: { id: F.ret.other } }))!.status).toBe("REQUESTED");
    expect(resendState.sent).toHaveLength(0);
  });
});

// ── reject ──────────────────────────────────────────────────────────────────

describe("POST /api/admin/returns/[id]/reject", () => {
  it("REQUESTED → REJECTED with reason as note, resolvedAt set, customer emailed", async () => {
    await signInAs(F.admin.super);
    const r = await call(H(reject.POST), "POST", `/api/admin/returns/${F.ret.requested}/reject`, { params: { id: F.ret.requested }, body: { reason: "Worn item" } });
    expect(r.status).toBe(200);
    expect(r.body.return).toMatchObject({ status: "REJECTED", adminNote: "Worn item" });
    const ret = await getViaRoute(F.ret.requested);
    expect(ret).toMatchObject({ status: "REJECTED", adminNote: "Worn item" });
    expect(ret.resolvedAt).toBeTruthy();
    const mails = sentTo("ana@example.test");
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("Update on your return request — Artisans' Stories");
    expect(mails[0].html).toContain("Worn item");
    const logs = await prisma.emailLog.findMany({ where: { relatedId: F.ret.requested } });
    expect(logs.map((l) => l.type)).toEqual(["RETURN_REJECTED"]);
  });

  it("a Resend failure keeps the rejection but is not logged as a sent email", async () => {
    await signInAs(F.admin.super);
    resendState.failNext = "resend down";
    const r = await call(H(reject.POST), "POST", `/api/admin/returns/${F.ret.requested}/reject`, { params: { id: F.ret.requested }, body: { reason: "Worn" } });
    expect(r.status).toBe(200);
    expect((await getViaRoute(F.ret.requested)).status).toBe("REJECTED");
    expect(await prisma.emailLog.count({ where: { relatedId: F.ret.requested } })).toBe(0);
  });

  it("an APPROVED return can be rejected too", async () => {
    await signInAs(F.admin.super);
    const r = await call(H(reject.POST), "POST", `/api/admin/returns/${F.ret.approved}/reject`, { params: { id: F.ret.approved }, body: { reason: "Never shipped back" } });
    expect(r.status).toBe(200);
    expect((await getViaRoute(F.ret.approved)).status).toBe("REJECTED");
    expect(sentTo("ben@example.test")).toHaveLength(1);
  });

  it("missing reason → 400; wrong status → 400; unknown id → 404; nothing changes", async () => {
    await signInAs(F.admin.super);
    const before = await snapshot();
    const noReason = await call(H(reject.POST), "POST", `/api/admin/returns/${F.ret.requested}/reject`, { params: { id: F.ret.requested }, body: {} });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error).toBe("Reason is required");
    for (const id of [F.ret.rejected, F.ret.received, F.ret.refunded]) {
      const r = await call(H(reject.POST), "POST", `/api/admin/returns/${id}/reject`, { params: { id }, body: { reason: "x" } });
      expect(r.status).toBe(400);
    }
    for (const id of ["nope", F.ret.other]) {
      const r = await call(H(reject.POST), "POST", `/api/admin/returns/${id}/reject`, { params: { id }, body: { reason: "x" } });
      expect(r.status).toBe(404);
    }
    expect(await snapshot()).toEqual(before);
  });
});

// ── receive ─────────────────────────────────────────────────────────────────

describe("POST /api/admin/returns/[id]/receive", () => {
  it("APPROVED → RECEIVED, emails the customer, no restock, no money", async () => {
    await signInAs(F.admin.super);
    const invBefore = await prisma.inventory.findMany({ orderBy: { id: "asc" } });
    const r = await call(H(receive.POST), "POST", `/api/admin/returns/${F.ret.approved}/receive`, { params: { id: F.ret.approved } });
    expect(r.status).toBe(200);
    expect(r.body.return).toMatchObject({ id: F.ret.approved, status: "RECEIVED" });
    expect((await getViaRoute(F.ret.approved)).status).toBe("RECEIVED");
    const mails = sentTo("ben@example.test");
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("We received your return for order AS-1007");
    const logs = await prisma.emailLog.findMany({ where: { toEmail: "ben@example.test", subject: { contains: "We received your return" } } });
    expect(logs).toHaveLength(1);
    // Known: there is no RECEIVED EmailLogType, so the receive notice is logged as RETURN_APPROVED (see report).
    expect(logs[0].type).toBe("RETURN_APPROVED");
    expect(await prisma.inventory.findMany({ orderBy: { id: "asc" } })).toEqual(invBefore);
    expect(stripeState.calls).toHaveLength(0);
  });

  it("a non-APPROVED return is 400; unknown id 404; nothing changes", async () => {
    await signInAs(F.admin.super);
    const before = await snapshot();
    for (const id of [F.ret.requested, F.ret.rejected, F.ret.received, F.ret.refunded]) {
      const r = await call(H(receive.POST), "POST", `/api/admin/returns/${id}/receive`, { params: { id } });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("Return must be APPROVED before marking as received");
    }
    for (const id of ["nope", F.ret.other]) {
      const r = await call(H(receive.POST), "POST", `/api/admin/returns/${id}/receive`, { params: { id } });
      expect(r.status).toBe(404);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("an email failure does not undo the status change", async () => {
    await signInAs(F.admin.super);
    resendState.failNext = "resend down";
    const r = await call(H(receive.POST), "POST", `/api/admin/returns/${F.ret.approved}/receive`, { params: { id: F.ret.approved } });
    expect(r.status).toBe(200);
    expect((await getViaRoute(F.ret.approved)).status).toBe("RECEIVED");
    expect(await prisma.emailLog.count({ where: { subject: { contains: "We received your return" } } })).toBe(0);
  });
});

// ── raw status ──────────────────────────────────────────────────────────────

describe("PATCH /api/admin/returns/[id]/status", () => {
  it("overwrites only the status: no email, no money, no restock, resolvedAt untouched", async () => {
    await signInAs(F.admin.super);
    const before = await snapshot();
    const r = await call(H(status.PATCH), "PATCH", `/api/admin/returns/${F.ret.requested}/status`, { params: { id: F.ret.requested }, body: { status: "RECEIVED" } });
    expect(r.status).toBe(200);
    expect(r.body.return).toMatchObject({ id: F.ret.requested, status: "RECEIVED", resolvedAt: null });
    expect((await getViaRoute(F.ret.requested)).status).toBe("RECEIVED");
    const after = await snapshot();
    expect({ ...after, returns: undefined }).toEqual({ ...before, returns: undefined });
  });

  it("invalid / missing status → 400; unknown id → 404; nothing changes", async () => {
    await signInAs(F.admin.super);
    const before = await snapshot();
    for (const body of [{ status: "LOST" }, {}]) {
      const r = await call(H(status.PATCH), "PATCH", `/api/admin/returns/${F.ret.requested}/status`, { params: { id: F.ret.requested }, body });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("Invalid status");
    }
    for (const id of ["nope", F.ret.other]) {
      const r = await call(H(status.PATCH), "PATCH", `/api/admin/returns/${id}/status`, { params: { id }, body: { status: "APPROVED" } });
      expect(r.status).toBe(404);
    }
    expect(await snapshot()).toEqual(before);
  });
});

// ── MCP reads ───────────────────────────────────────────────────────────────

describe("MCP returns_list / returns_get", () => {
  it("returns_list returns seeded data (read key), filters and paginates", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      const all = await mcp.call("returns_list");
      expect(all.total).toBe(5);
      expect(all.returns.map((x: { id: string }) => x.id)).toEqual([F.ret.requested, F.ret.approved, F.ret.rejected, F.ret.received, F.ret.refunded]);
      const refunded = all.returns.find((x: { id: string }) => x.id === F.ret.refunded);
      expect(refunded).toMatchObject({ status: "REFUNDED", refundAmount: 2000, order: { orderNumber: "AS-1006" } });

      const f = await mcp.call("returns_list", { status: "APPROVED" });
      expect(f.returns.map((x: { id: string }) => x.id)).toEqual([F.ret.approved]);
      const p = await mcp.call("returns_list", { limit: 2, page: 2, status: null });
      expect(p).toMatchObject({ total: 5, page: 2, totalPages: 3 });
      expect(p.returns.map((x: { id: string }) => x.id)).toEqual([F.ret.rejected, F.ret.received]);

      // Schema violations are rejected by the MCP SDK before the tool runs.
      const bad = await mcp.call("returns_list", { status: "LOST" });
      expect(bad).toMatchObject({ isError: true });
      expect(bad.__text).toContain("Invalid arguments");
    });
  });

  it("returns_list is tenant-scoped", async () => {
    await withMcp(KEYS.otherRead, async (mcp) => {
      const all = await mcp.call("returns_list");
      expect(all.returns.map((x: { id: string }) => x.id)).toEqual([F.ret.other]);
      expect(all.returns[0].order.orderNumber).toBe("OS-2001");
    });
  });

  it("returns_get returns the return with order and items; unknown / other tenant → 404", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      const g = await mcp.call("returns_get", { returnId: F.ret.received });
      expect(g.return).toMatchObject({ id: F.ret.received, status: "RECEIVED", order: { orderNumber: "AS-1005", total: 15500, financialStatus: "PAID" } });
      expect(g.return.items).toHaveLength(2);
      for (const returnId of ["nope", F.ret.other]) {
        const r = await mcp.call("returns_get", { returnId });
        expect(r).toMatchObject({ done: false, blocked: true, status: 404, reason: "Return not found" });
      }
    });
  });

  it("a read-only key cannot see the return write tools", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      const names = await mcp.toolNames();
      expect(names).toEqual(expect.arrayContaining(["returns_list", "returns_get"]));
      for (const t of ["returns_set_note", "returns_approve", "returns_reject", "returns_receive", "returns_set_status", "returns_refund"]) {
        expect(names).not.toContain(t);
      }
    });
  });
});

// ── MCP writes ──────────────────────────────────────────────────────────────

describe("MCP returns write tools: preview → confirm → replay", () => {
  it("returns_set_note", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await snapshot();
      const flow = await previewConfirmReplay(mcp, "returns_set_note", { returnId: F.ret.rejected, adminNote: "Agent note" }, async (pv) => {
        expect(pv.preview).toMatchObject({ returnId: F.ret.rejected, orderNumber: "AS-1008", currentNote: "Outside window", newNote: "Agent note", emailsSent: [] });
        expect(await snapshot()).toEqual(before);
      });
      expect(expectConfirmed(flow).return).toMatchObject({ adminNote: "Agent note" });
      expectReplayBlocked(flow);
      expect((await mcp.call("returns_get", { returnId: F.ret.rejected })).return.adminNote).toBe("Agent note");
      expect(resendState.sent).toHaveLength(0);
      const nf = await mcp.call("returns_set_note", { returnId: F.ret.other, adminNote: "x" });
      expect(nf).toMatchObject({ blocked: true, status: 404 });
    });
  });

  it("returns_approve", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await snapshot();
      const flow = await previewConfirmReplay(mcp, "returns_approve", { returnId: F.ret.requested }, async (pv) => {
        expect(pv.preview).toMatchObject({
          returnId: F.ret.requested, currentStatus: "REQUESTED", newStatus: "APPROVED", moneyMoved: false,
          email: { to: "ana@example.test", type: "RETURN_APPROVED", subject: "Your return has been approved — Artisans' Stories" },
        });
        expect(await snapshot()).toEqual(before);
      });
      expect(expectConfirmed(flow).return.status).toBe("APPROVED");
      expectReplayBlocked(flow);
      expect(sentTo("ana@example.test")).toHaveLength(1);
      expect(await prisma.emailLog.count({ where: { relatedId: F.ret.requested, type: "RETURN_APPROVED" } })).toBe(1);
      expect((await mcp.call("returns_get", { returnId: F.ret.requested })).return.status).toBe("APPROVED");
      // A second approve is now refused by the guard.
      expect(await mcp.call("returns_approve", { returnId: F.ret.requested })).toMatchObject({ blocked: true, status: 400 });
      expect(await mcp.call("returns_approve", { returnId: "nope" })).toMatchObject({ blocked: true, status: 404 });
    });
  });

  it("returns_reject", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await snapshot();
      const flow = await previewConfirmReplay(mcp, "returns_reject", { returnId: F.ret.approved, reason: "Not eligible" }, async (pv) => {
        expect(pv.preview).toMatchObject({
          currentStatus: "APPROVED", newStatus: "REJECTED", reason: "Not eligible", setsResolvedAt: true, moneyMoved: false,
          email: { to: "ben@example.test", type: "RETURN_REJECTED" },
        });
        expect(await snapshot()).toEqual(before);
      });
      expect(expectConfirmed(flow).return).toMatchObject({ status: "REJECTED", adminNote: "Not eligible" });
      expectReplayBlocked(flow);
      expect(sentTo("ben@example.test")).toHaveLength(1);
      const got = (await mcp.call("returns_get", { returnId: F.ret.approved })).return;
      expect(got).toMatchObject({ status: "REJECTED", adminNote: "Not eligible" });
      expect(got.resolvedAt).toBeTruthy();
      expect(await mcp.call("returns_reject", { returnId: F.ret.received, reason: "x" })).toMatchObject({ blocked: true, status: 400 });
      expect(await mcp.call("returns_reject", { returnId: F.ret.requested, reason: "" })).toMatchObject({ isError: true });
      expect((await prisma.return.findUnique({ where: { id: F.ret.requested } }))!.status).toBe("REQUESTED");
    });
  });

  it("returns_receive", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await snapshot();
      const flow = await previewConfirmReplay(mcp, "returns_receive", { returnId: F.ret.approved }, async (pv) => {
        expect(pv.preview).toMatchObject({
          returnId: F.ret.approved, orderNumber: "AS-1007", currentStatus: "APPROVED", newStatus: "RECEIVED", moneyMoved: false,
          email: { to: "ben@example.test", subject: "We received your return for order AS-1007" },
        });
        expect(await snapshot()).toEqual(before);
      });
      expect(expectConfirmed(flow).return.status).toBe("RECEIVED");
      expectReplayBlocked(flow);
      expect(sentTo("ben@example.test")).toHaveLength(1);
      expect((await mcp.call("returns_get", { returnId: F.ret.approved })).return.status).toBe("RECEIVED");
      const after = await snapshot();
      expect(after.inventory).toEqual(before.inventory);
      expect(after.invLogs).toBe(before.invLogs);
      expect(await mcp.call("returns_receive", { returnId: F.ret.requested })).toMatchObject({ blocked: true, status: 400 });
    });
  });

  it("returns_set_status", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await snapshot();
      const flow = await previewConfirmReplay(mcp, "returns_set_status", { returnId: F.ret.rejected, status: "REQUESTED" }, async (pv) => {
        expect(pv.preview).toMatchObject({ returnId: F.ret.rejected, currentStatus: "REJECTED", newStatus: "REQUESTED" });
        expect(await snapshot()).toEqual(before);
      });
      expect(expectConfirmed(flow).return.status).toBe("REQUESTED");
      expectReplayBlocked(flow);
      expect((await mcp.call("returns_get", { returnId: F.ret.rejected })).return.status).toBe("REQUESTED");
      const after = await snapshot();
      expect({ ...after, returns: undefined }).toEqual({ ...before, returns: undefined });
      expect(await mcp.call("returns_set_status", { returnId: "nope", status: "APPROVED" })).toMatchObject({ blocked: true, status: 404 });
      expect(await mcp.call("returns_set_status", { returnId: F.ret.rejected, status: "LOST" })).toMatchObject({ isError: true });
    });
  });

  it("the other store's admin key cannot act on this store's return", async () => {
    await withMcp(KEYS.otherAdmin, async (mcp) => {
      const r = await mcp.call("returns_approve", { returnId: F.ret.requested });
      expect(r).toMatchObject({ blocked: true, status: 404 });
      expect((await prisma.return.findUnique({ where: { id: F.ret.requested } }))!.status).toBe("REQUESTED");
      const own = await mcp.call("returns_get", { returnId: F.ret.other });
      expect(own.return.order.orderNumber).toBe("OS-2001");
      expect((await prisma.return.findUnique({ where: { id: F.ret.other } }))!.tenantId).toBe(OTHER);
    });
  });
});
