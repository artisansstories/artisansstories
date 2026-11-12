/**
 * admin-services/returns.ts — return logic shared by /api/admin/returns/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). The only
 * additions are optional `opts.idempotencyKey` (forwarded to Stripe; routes never
 * pass it) and read-only `preview*` functions used by MCP write tools.
 */
import Stripe from "stripe";
import { Resend } from "resend";
import { ReturnStatus, Prisma } from "@prisma/client";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { returnApprovedHtml } from "@/lib/emails/return-approved";
import { returnRejectedHtml } from "@/lib/emails/return-rejected";
import { refundIssuedHtml } from "@/lib/emails/refund-issued";
import { getEmailBranding, emailLogoHtml } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
import { ok, fail } from "./result";

const resend = new Resend(process.env.RESEND_API_KEY);

/** The refund route constructed its Stripe client per request; kept identical. */
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia",
  });
}

export interface StripeOpts {
  idempotencyKey?: string;
}

function reqOpts(opts: StripeOpts | undefined, suffix: string): Stripe.RequestOptions | undefined {
  return opts?.idempotencyKey ? { idempotencyKey: `${opts.idempotencyKey}_${suffix}` } : undefined;
}

// ── list / get ──────────────────────────────────────────────────────────────

export interface ReturnListParams {
  status?: string;
  page?: number;
  limit?: number;
}

export async function listReturns(db: TenantPrisma, p: ReturnListParams) {
  const status = p.status ?? "";
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(100, Math.max(1, p.limit ?? 20));
  const where: Prisma.ReturnWhereInput = {};
  if (status && Object.values(ReturnStatus).includes(status as ReturnStatus)) {
    where.status = status as ReturnStatus;
  }
  const [total, returns] = await Promise.all([
    db.return.count({ where }),
    db.return.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { requestedAt: "desc" },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            email: true,
            total: true,
            customer: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        items: {
          include: {
            orderItem: { select: { title: true, variantTitle: true } },
          },
        },
      },
    }),
  ]);
  return ok({ returns, total, page, totalPages: Math.ceil(total / limit) });
}

export async function getReturn(db: TenantPrisma, id: string) {
  const ret = await db.return.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          email: true,
          total: true,
          status: true,
          stripePaymentIntentId: true,
          financialStatus: true,
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
      items: {
        include: {
          orderItem: {
            select: {
              id: true,
              title: true,
              variantTitle: true,
              quantity: true,
              price: true,
              total: true,
              variantId: true,
              productSnapshot: true,
            },
          },
        },
      },
    },
  });
  if (!ret) return fail(404, "Return not found");
  return ok({ return: ret });
}

// ── admin note ──────────────────────────────────────────────────────────────

export async function setReturnNote(db: TenantPrisma, id: string, adminNote: string | undefined) {
  const ret = await db.return.update({
    where: { id },
    data: { adminNote },
  });
  return ok({ return: ret });
}

export async function previewReturnNote(db: TenantPrisma, id: string, adminNote: string) {
  const ret = await db.return.findUnique({
    where: { id },
    select: { id: true, adminNote: true, order: { select: { orderNumber: true } } },
  });
  if (!ret) return fail(404, "Return not found");
  return ok({
    returnId: ret.id,
    orderNumber: ret.order.orderNumber,
    currentNote: ret.adminNote,
    newNote: adminNote,
    emailsSent: [],
  });
}

// ── approve ─────────────────────────────────────────────────────────────────

async function approveGuard(db: TenantPrisma, id: string) {
  const ret = await db.return.findUnique({
    where: { id },
    include: {
      order: { select: { id: true, orderNumber: true, email: true } },
      items: {
        include: {
          orderItem: { select: { title: true, variantTitle: true } },
        },
      },
    },
  });
  if (!ret) return fail(404, "Return not found");
  if (ret.status !== "REQUESTED") {
    return fail(400, "Return is not in REQUESTED status");
  }
  return ok(ret);
}

export async function previewApproveReturn(db: TenantPrisma, id: string) {
  const g = await approveGuard(db, id);
  if (!g.ok) return g;
  const ret = g.data;
  const branding = await getEmailBranding(db.$tenantId);
  return ok({
    returnId: ret.id,
    orderNumber: ret.order.orderNumber,
    currentStatus: ret.status,
    newStatus: "APPROVED",
    items: ret.items.map((item) => ({
      title: item.orderItem.title,
      variantTitle: item.orderItem.variantTitle,
      quantity: item.quantity,
    })),
    email: {
      to: ret.order.email,
      subject: `Your return has been approved — ${branding.storeName}`,
      type: "RETURN_APPROVED",
    },
    moneyMoved: false,
  });
}

export async function approveReturn(db: TenantPrisma, id: string) {
  const g = await approveGuard(db, id);
  if (!g.ok) return g;
  const ret = g.data;
  const updated = await db.return.update({
    where: { id },
    data: { status: "APPROVED" },
  });
  const branding = await getEmailBranding(db.$tenantId);
  const subject = `Your return has been approved — ${branding.storeName}`;
  const approveResult = await resend.emails.send({
    from: branding.from,
    to: ret.order.email,
    replyTo: branding.replyTo ?? branding.fromAddress,
    subject,
    html: returnApprovedHtml({
      orderNumber: ret.order.orderNumber,
      email: ret.order.email,
      returnId: ret.id,
      items: ret.items.map((item) => ({
        title: item.orderItem.title,
        variantTitle: item.orderItem.variantTitle ?? undefined,
        quantity: item.quantity,
      })),
    }, branding),
  });
  await logEmail({ tenantId: db.$tenantId, type: "RETURN_APPROVED", toEmail: ret.order.email, fromEmail: branding.fromAddress, subject, resendId: approveResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
  return ok({ return: updated });
}

// ── reject ──────────────────────────────────────────────────────────────────

async function rejectGuard(db: TenantPrisma, id: string, reason: string | undefined) {
  if (!reason) {
    return fail(400, "Reason is required");
  }
  const ret = await db.return.findUnique({
    where: { id },
    include: {
      order: { select: { id: true, orderNumber: true, email: true } },
      items: {
        include: {
          orderItem: { select: { title: true, variantTitle: true } },
        },
      },
    },
  });
  if (!ret) return fail(404, "Return not found");
  if (ret.status !== "REQUESTED" && ret.status !== "APPROVED") {
    return fail(400, "Return cannot be rejected in its current status");
  }
  return ok(ret);
}

export async function previewRejectReturn(db: TenantPrisma, id: string, reason: string) {
  const g = await rejectGuard(db, id, reason);
  if (!g.ok) return g;
  const ret = g.data;
  const branding = await getEmailBranding(db.$tenantId);
  return ok({
    returnId: ret.id,
    orderNumber: ret.order.orderNumber,
    currentStatus: ret.status,
    newStatus: "REJECTED",
    reason,
    adminNote: {
      current: ret.adminNote,
      new: reason,
      note: "The rejection reason REPLACES the existing admin note and is shown to the customer in the email.",
    },
    setsResolvedAt: true,
    email: {
      to: ret.order.email,
      subject: `Update on your return request — ${branding.storeName}`,
      type: "RETURN_REJECTED",
    },
    moneyMoved: false,
  });
}

export async function rejectReturn(db: TenantPrisma, id: string, reason: string) {
  const g = await rejectGuard(db, id, reason);
  if (!g.ok) return g;
  const ret = g.data;
  const updated = await db.return.update({
    where: { id },
    data: {
      status: "REJECTED",
      adminNote: reason,
      resolvedAt: new Date(),
    },
  });
  const branding = await getEmailBranding(db.$tenantId);
  const subject = `Update on your return request — ${branding.storeName}`;
  const rejectResult = await resend.emails.send({
    from: branding.from,
    to: ret.order.email,
    replyTo: branding.replyTo ?? branding.fromAddress,
    subject,
    html: returnRejectedHtml({
      orderNumber: ret.order.orderNumber,
      email: ret.order.email,
      reason,
      items: ret.items.map((item) => ({
        title: item.orderItem.title,
        variantTitle: item.orderItem.variantTitle ?? undefined,
        quantity: item.quantity,
      })),
    }, branding),
  });
  await logEmail({ tenantId: db.$tenantId, type: "RETURN_REJECTED", toEmail: ret.order.email, fromEmail: branding.fromAddress, subject, resendId: rejectResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
  return ok({ return: updated });
}

// ── receive ─────────────────────────────────────────────────────────────────

async function receiveGuard(db: TenantPrisma, id: string) {
  const ret = await db.return.findUnique({ where: { id } });
  if (!ret) return fail(404, "Return not found");
  if (ret.status !== "APPROVED") {
    return fail(400, "Return must be APPROVED before marking as received");
  }
  return ok(ret);
}

export async function previewReceiveReturn(db: TenantPrisma, id: string) {
  const g = await receiveGuard(db, id);
  if (!g.ok) return g;
  const retWithOrder = await db.return.findUnique({
    where: { id },
    include: { order: { select: { email: true, orderNumber: true, id: true } } },
  });
  return ok({
    returnId: g.data.id,
    orderNumber: retWithOrder?.order?.orderNumber ?? null,
    currentStatus: g.data.status,
    newStatus: "RECEIVED",
    email: retWithOrder?.order
      ? {
          to: retWithOrder.order.email,
          subject: `We received your return for order ${retWithOrder.order.orderNumber}`,
          type: "RETURN_APPROVED",
          note: "Email failures are logged and do not undo the status change.",
        }
      : null,
    moneyMoved: false,
    restock: "None. Inventory is only restocked by the refund step (when restock is true).",
  });
}

export async function receiveReturn(db: TenantPrisma, id: string) {
  const g = await receiveGuard(db, id);
  if (!g.ok) return g;
  const retWithOrder = await db.return.findUnique({
    where: { id },
    include: { order: { select: { email: true, orderNumber: true, id: true } } },
  });
  const updated = await db.return.update({
    where: { id },
    data: { status: "RECEIVED" },
  });
  // Notify customer we received the return
  if (retWithOrder?.order) {
    try {
      const branding = await getEmailBranding(db.$tenantId);
      const year = new Date().getFullYear();
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;"><tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="padding:28px 32px;text-align:center;border-bottom:1px solid #ede8df;">
${emailLogoHtml(branding)}</td></tr>
<tr><td style="padding:36px 40px;text-align:center;">
<h2 style="margin:0 0 12px;font-size:24px;color:#3a2e24;font-weight:700;">We received your return</h2>
<p style="margin:0 0 16px;font-size:15px;color:#7a6852;">We've received the items for order <strong>${retWithOrder.order.orderNumber}</strong> and are reviewing them now.</p>
<p style="margin:0;font-size:14px;color:#9a876e;">You'll hear from us shortly regarding your refund. Questions? <a href="mailto:${branding.fromAddress}" style="color:${branding.accentColor};">${branding.fromAddress}</a></p>
</td></tr>
<tr><td style="padding:20px 40px;background:#3a2e24;text-align:center;"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.4);">&copy; ${year} ${branding.storeName}</p></td></tr>
</table></td></tr></table></body></html>`;
      const result = await resend.emails.send({
        from: branding.from,
        to: retWithOrder.order.email,
        replyTo: branding.replyTo ?? branding.fromAddress,
        subject: `We received your return for order ${retWithOrder.order.orderNumber}`,
        html,
      });
      await logEmail({ tenantId: db.$tenantId, type: "RETURN_APPROVED", toEmail: retWithOrder.order.email, fromEmail: branding.fromAddress, subject: `We received your return for order ${retWithOrder.order.orderNumber}`, bodyHtml: html, resendId: result.data?.id, relatedId: retWithOrder.order.id, relatedType: "ORDER" });
    } catch (e) { console.error("Failed to send return received email:", e); }
  }
  return ok({ return: updated });
}

// ── set status (raw) ────────────────────────────────────────────────────────

async function statusGuard(db: TenantPrisma, id: string, status: ReturnStatus | undefined) {
  if (!status || !Object.values(ReturnStatus).includes(status)) {
    return fail(400, "Invalid status");
  }
  const ret = await db.return.findUnique({ where: { id } });
  if (!ret) return fail(404, "Return not found");
  return ok(ret);
}

export async function previewSetReturnStatus(db: TenantPrisma, id: string, status: ReturnStatus) {
  const g = await statusGuard(db, id, status);
  if (!g.ok) return g;
  return ok({
    returnId: g.data.id,
    currentStatus: g.data.status,
    newStatus: status,
    sideEffects: "None. Only the status field changes: no email, no refund, no restock, resolvedAt untouched.",
  });
}

export async function setReturnStatus(db: TenantPrisma, id: string, status: ReturnStatus) {
  const g = await statusGuard(db, id, status);
  if (!g.ok) return g;
  const updated = await db.return.update({
    where: { id },
    data: { status },
  });
  return ok({ return: updated });
}

// ── refund ──────────────────────────────────────────────────────────────────

export interface ReturnRefundBody {
  amount: number;
  restock: boolean;
}

async function refundGuard(db: TenantPrisma, id: string, body: ReturnRefundBody) {
  if (body.amount === undefined || body.amount === null || body.amount < 0) {
    return fail(400, "Invalid refund amount");
  }
  const ret = await db.return.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          email: true,
          total: true,
          stripePaymentIntentId: true,
          financialStatus: true,
        },
      },
      items: {
        include: {
          orderItem: {
            select: {
              id: true,
              title: true,
              variantTitle: true,
              variantId: true,
            },
          },
        },
      },
    },
  });
  if (!ret) return fail(404, "Return not found");
  if (body.amount > ret.order.total) {
    return fail(400, "Refund amount cannot exceed order total");
  }
  return ok(ret);
}

/**
 * Read-only. Applies the route's guards, plus MCP-only safety blocks for cases
 * where the execute path would refund money and then fail or double-refund:
 * return already REFUNDED, Stripe charge balance too small, or a restock target
 * with no inventory row (the route would refund, then throw mid-way).
 */
export async function previewRefundReturn(db: TenantPrisma, id: string, body: ReturnRefundBody) {
  const g = await refundGuard(db, id, body);
  if (!g.ok) return g;
  const ret = g.data;
  const order = ret.order;

  if (ret.status === "REFUNDED" || ret.stripeRefundId) {
    return fail(409, "This return has already been refunded", {
      refundAmount: ret.refundAmount,
      stripeRefundId: ret.stripeRefundId,
    });
  }

  let payment: Record<string, unknown>;
  if (!order.stripePaymentIntentId) {
    payment = { action: "none", note: "Order has no Stripe payment; no money moves. Records are still marked refunded." };
  } else if (body.amount === 0) {
    payment = { action: "none", note: "Amount is 0; no Stripe refund is created." };
  } else {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    const latest = pi.latest_charge;
    if (!latest) return fail(400, "No charge found on this payment");
    const charge = typeof latest === "string" ? await stripe.charges.retrieve(latest) : latest;
    const alreadyRefunded = charge.amount_refunded ?? 0;
    const refundable = charge.amount - alreadyRefunded;
    if (body.amount > refundable) {
      return fail(400, `Refund amount ${body.amount} exceeds the refundable balance of ${refundable} cents on the Stripe charge`, {
        chargedAmount: charge.amount,
        alreadyRefunded,
      });
    }
    payment = {
      action: "stripe_refund",
      chargeId: charge.id,
      chargedAmount: charge.amount,
      alreadyRefundedOnCharge: alreadyRefunded,
      refundableBalance: refundable,
      refundAmount: body.amount,
      refundAmountFormatted: `$${(body.amount / 100).toFixed(2)}`,
    };
  }

  const isPartial = body.amount < order.total;
  const newFinancialStatus = isPartial ? "PARTIALLY_REFUNDED" : "REFUNDED";

  const restock: { title: string; variantTitle: string | null; variantId: string | null; increment: number; currentQuantity: number | null; newQuantity: number | null }[] = [];
  if (body.restock) {
    const variantIds = ret.items.map((i) => i.orderItem.variantId).filter((v): v is string => !!v);
    const inv = await db.inventory.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, quantity: true },
    });
    const byVariant = new Map(inv.map((r) => [r.variantId, r.quantity]));
    for (const item of ret.items) {
      const vId = item.orderItem.variantId;
      const current = vId ? byVariant.get(vId) ?? null : null;
      if (vId && current === null) {
        return fail(409, `No inventory record for variant ${vId} ("${item.orderItem.title}"); restocking would fail after the refund is issued. Retry with restock false, or fix inventory first.`);
      }
      restock.push({
        title: item.orderItem.title,
        variantTitle: item.orderItem.variantTitle,
        variantId: vId,
        increment: vId ? item.quantity : 0,
        currentQuantity: current,
        newQuantity: current === null ? null : current + item.quantity,
      });
    }
  }

  const branding = await getEmailBranding(db.$tenantId);
  return ok({
    returnId: ret.id,
    orderNumber: order.orderNumber,
    orderTotal: order.total,
    refundAmount: body.amount,
    amountDerivation: "Exactly the requested amount (cents). Must be <= order total; not reduced by earlier refunds.",
    payment,
    returnUpdate: { currentStatus: ret.status, newStatus: "REFUNDED", refundAmount: body.amount, restockItems: body.restock, setsResolvedAt: true },
    orderUpdate: {
      currentFinancialStatus: order.financialStatus,
      newFinancialStatus,
      statusChange: isPartial ? "none (partial refund keeps order status)" : "order status -> REFUNDED",
      derivation: `amount ${body.amount} ${isPartial ? "<" : ">="} order total ${order.total}`,
    },
    restock: body.restock ? restock : "Not restocking",
    email: {
      to: order.email,
      subject: `Your refund has been issued — ${branding.storeName}`,
      type: "REFUND_ISSUED",
    },
  });
}

export async function refundReturn(db: TenantPrisma, id: string, body: ReturnRefundBody, opts?: StripeOpts) {
  const g = await refundGuard(db, id, body);
  if (!g.ok) return g;
  const ret = g.data;
  const order = ret.order;
  let stripeRefundId: string | undefined;
  if (order.stripePaymentIntentId) {
    const stripe = getStripe();
    if (body.amount > 0) {
      const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
      const chargeId = pi.latest_charge as string;
      const refund = await stripe.refunds.create({ charge: chargeId, amount: body.amount }, reqOpts(opts, "return_refund"));
      stripeRefundId = refund.id;
    }
  }
  const isPartial = body.amount < order.total;
  const newFinancialStatus = isPartial ? "PARTIALLY_REFUNDED" : "REFUNDED";
  const [updated] = await Promise.all([
    db.return.update({
      where: { id },
      data: {
        status: "REFUNDED",
        refundAmount: body.amount,
        stripeRefundId: stripeRefundId ?? null,
        resolvedAt: new Date(),
        restockItems: body.restock,
      },
    }),
    db.order.update({
      where: { id: order.id },
      data: {
        financialStatus: newFinancialStatus,
        // Full refund = order is refunded; partial = keep order status as-is
        ...(isPartial ? {} : { status: "REFUNDED" }),
      },
    }),
  ]);
  // Restock inventory if requested
  if (body.restock) {
    for (const returnItem of ret.items) {
      const orderItem = returnItem.orderItem;
      if (orderItem.variantId) {
        await db.inventory.update({
          where: { variantId: orderItem.variantId },
          data: { quantity: { increment: returnItem.quantity } },
        });
      }
    }
  }
  const branding = await getEmailBranding(db.$tenantId);
  const subject = `Your refund has been issued — ${branding.storeName}`;
  const refundResult = await resend.emails.send({
    from: branding.from,
    to: order.email,
    replyTo: branding.replyTo ?? branding.fromAddress,
    subject,
    html: refundIssuedHtml({
      orderNumber: order.orderNumber,
      email: order.email,
      refundAmount: body.amount,
      items: ret.items.map((item) => ({
        title: item.orderItem.title,
        variantTitle: item.orderItem.variantTitle ?? undefined,
        quantity: item.quantity,
      })),
    }, branding),
  });
  await logEmail({ tenantId: db.$tenantId, type: "REFUND_ISSUED", toEmail: order.email, fromEmail: branding.fromAddress, subject, resendId: refundResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
  return ok({ return: updated });
}
