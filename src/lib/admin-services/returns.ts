/**
 * admin-services/returns.ts — return logic shared by /api/admin/returns/* and MCP.
 *
 * Extracted from the route handlers, plus read-only `preview*` functions used by
 * MCP write tools. The refund path is idempotent on its own (see refundReturn),
 * so route and MCP share one Stripe idempotency key per return.
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
  const existing = await db.return.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return fail(404, "Return not found");
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
  // Resend reports failures as { error }; only log emails that were sent.
  if (approveResult.error) console.error(`[returns] approval email failed for return ${ret.id}:`, approveResult.error);
  else await logEmail({ tenantId: db.$tenantId, type: "RETURN_APPROVED", toEmail: ret.order.email, fromEmail: branding.fromAddress, subject, resendId: approveResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
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
  if (rejectResult.error) console.error(`[returns] rejection email failed for return ${ret.id}:`, rejectResult.error);
  else await logEmail({ tenantId: db.$tenantId, type: "RETURN_REJECTED", toEmail: ret.order.email, fromEmail: branding.fromAddress, subject, resendId: rejectResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
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
      if (result.error) throw new Error(result.error.message);
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
  if (typeof body.amount !== "number" || !Number.isInteger(body.amount) || body.amount < 0) {
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
  // Status check before any money moves: a return is refunded at most once.
  if (ret.status === "REFUNDED" || ret.stripeRefundId) {
    return fail(409, "This return has already been refunded", {
      refundAmount: ret.refundAmount,
      stripeRefundId: ret.stripeRefundId,
    });
  }
  if (body.amount > ret.order.total) {
    return fail(400, "Refund amount cannot exceed order total");
  }
  return ok(ret);
}

type RefundGuarded = Extract<Awaited<ReturnType<typeof refundGuard>>, { ok: true }>["data"];

interface RestockLine {
  title: string;
  variantTitle: string | null;
  variantId: string | null;
  increment: number;
  /** null when the variant has no inventory row yet (one is created). */
  currentQuantity: number | null;
  newQuantity: number | null;
  action: "increment" | "create_inventory" | "skip";
  warning?: string;
}

/**
 * Read-only restock plan. A variant with no inventory row gets one created with
 * the returned quantity; a variant that no longer exists is skipped with a
 * warning. Planning up front means the write transaction can't fail on it.
 */
async function planRestock(db: TenantPrisma, ret: RefundGuarded): Promise<RestockLine[]> {
  const variantIds = ret.items.map((i) => i.orderItem.variantId).filter((v): v is string => !!v);
  const [inv, variants] = await Promise.all([
    db.inventory.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, quantity: true } }),
    db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true } }),
  ]);
  const qty = new Map(inv.map((r) => [r.variantId, r.quantity]));
  const exists = new Set(variants.map((v) => v.id));
  return ret.items.map((item) => {
    const vId = item.orderItem.variantId;
    const base = { title: item.orderItem.title, variantTitle: item.orderItem.variantTitle, variantId: vId };
    if (!vId || !exists.has(vId)) {
      return {
        ...base,
        increment: 0,
        currentQuantity: null,
        newQuantity: null,
        action: "skip" as const,
        warning: `Not restocked: "${item.orderItem.title}" has no product variant${vId ? ` (variant ${vId} was deleted)` : ""}.`,
      };
    }
    const current = qty.get(vId);
    if (current === undefined) {
      return { ...base, increment: item.quantity, currentQuantity: null, newQuantity: item.quantity, action: "create_inventory" as const };
    }
    return { ...base, increment: item.quantity, currentQuantity: current, newQuantity: current + item.quantity, action: "increment" as const };
  });
}

/** A refund already on this payment intent whose metadata matches, if any. */
export async function findEarlierRefund(
  stripe: Stripe,
  paymentIntentId: string,
  match: (metadata: Record<string, string>) => boolean,
): Promise<Stripe.Refund | null> {
  const list = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  return list.data.find((r) => r.status !== "failed" && r.status !== "canceled" && match(r.metadata ?? {})) ?? null;
}

/** Stable Stripe idempotency key: one return is refunded at most once. */
export function returnRefundIdempotencyKey(returnId: string): string {
  return `return_refund_${returnId}`;
}

/**
 * Read-only. Applies the route's guards (return already REFUNDED → 409), plus
 * an MCP-only block when the Stripe charge balance is too small. A refund an
 * earlier attempt issued but failed to record is shown as recorded-not-repeated;
 * the restock plan shows inventory rows that will be created and skipped lines.
 */
export async function previewRefundReturn(db: TenantPrisma, id: string, body: ReturnRefundBody) {
  const g = await refundGuard(db, id, body);
  if (!g.ok) return g;
  const ret = g.data;
  const order = ret.order;

  let payment: Record<string, unknown>;
  if (!order.stripePaymentIntentId) {
    payment = { action: "none", note: "Order has no Stripe payment; no money moves. Records are still marked refunded." };
  } else if (body.amount === 0) {
    payment = { action: "none", note: "Amount is 0; no Stripe refund is created." };
  } else {
    const stripe = getStripe();
    // An earlier attempt may have refunded in Stripe and then failed to record
    // it. That refund already used the charge balance, so the balance check
    // would block the retry that records it; refundReturn reuses it instead.
    const earlier = await findEarlierRefund(stripe, order.stripePaymentIntentId, (m) => m.returnId === ret.id);
    if (earlier && earlier.amount !== body.amount) {
      return fail(409, `A Stripe refund of ${earlier.amount} cents (${earlier.id}) was already issued for this return, but not recorded. Retry with amount ${earlier.amount} to record it.`, {
        moneyMoved: true,
        stripeRefundId: earlier.id,
        refundedAmount: earlier.amount,
      });
    }
    if (earlier) {
      payment = {
        action: "record_existing_refund",
        stripeRefundId: earlier.id,
        refundAmount: earlier.amount,
        note: "Already refunded in Stripe by an earlier attempt that failed to record it. No new money moves; only the store records are updated.",
      };
    } else {
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
  }

  const isPartial = body.amount < order.total;
  const newFinancialStatus = isPartial ? "PARTIALLY_REFUNDED" : "REFUNDED";

  const restock = body.restock ? await planRestock(db, ret) : null;

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
    restock: restock ?? "Not restocking",
    ...(restock?.some((r) => r.warning) ? { warnings: restock.flatMap((r) => (r.warning ? [r.warning] : [])) } : {}),
    email: {
      to: order.email,
      subject: `Your refund has been issued — ${branding.storeName}`,
      type: "REFUND_ISSUED",
    },
  });
}

/**
 * Refund a return. Order of operations, so money and records can't disagree:
 *   1. Guards (status check: never refund a REFUNDED return) and the restock plan.
 *   2. Stripe refund with a key derived from the return id, so a retry or a
 *      double submit replays the same refund instead of creating a second one.
 *   3. One DB transaction: return, order, inventory rows + logs. If it fails
 *      after Stripe succeeded, the response says so (moneyMoved) and a retry is
 *      safe: step 2 replays and step 3 runs again.
 *   4. Customer email. A send failure is reported, never turned into a 500.
 */
export async function refundReturn(db: TenantPrisma, id: string, body: ReturnRefundBody) {
  const g = await refundGuard(db, id, body);
  if (!g.ok) return g;
  const ret = g.data;
  const order = ret.order;
  const restock = body.restock ? await planRestock(db, ret) : [];
  const warnings = restock.flatMap((r) => (r.warning ? [r.warning] : []));
  for (const w of warnings) console.warn(`[returns] ${ret.id}: ${w}`);

  let stripeRefundId: string | null = null;
  if (order.stripePaymentIntentId && body.amount > 0) {
    try {
      const stripe = getStripe();
      // A refund from an earlier attempt whose DB write failed is reused, not
      // repeated. Looking it up by metadata also covers retries after Stripe's
      // 24h idempotency window.
      const earlier = await findEarlierRefund(stripe, order.stripePaymentIntentId, (m) => m.returnId === ret.id);
      if (earlier && earlier.amount !== body.amount) {
        return fail(409, `A Stripe refund of ${earlier.amount} cents (${earlier.id}) was already issued for this return, but not recorded. Retry with amount ${earlier.amount} to record it.`, {
          moneyMoved: true,
          stripeRefundId: earlier.id,
          refundedAmount: earlier.amount,
        });
      }
      const refund = earlier ?? await stripe.refunds.create(
        { payment_intent: order.stripePaymentIntentId, amount: body.amount, metadata: { returnId: ret.id, orderId: order.id } },
        { idempotencyKey: returnRefundIdempotencyKey(ret.id) },
      );
      stripeRefundId = refund.id;
    } catch (err) {
      console.error(`[returns] Stripe refund failed for return ${ret.id}:`, err);
      const msg = err instanceof Error ? err.message : String(err);
      return fail(502, `Stripe refund failed, nothing was changed: ${msg}`, { moneyMoved: false });
    }
  }

  const isPartial = body.amount < order.total;
  const newFinancialStatus = isPartial ? "PARTIALLY_REFUNDED" : "REFUNDED";
  const tenantId = db.$tenantId;
  let updated;
  try {
    updated = await db.$transaction(async (tx) => {
      // Conditional on status, so two concurrent requests record one refund.
      const claimed = await tx.return.updateMany({
        where: { id, status: { not: "REFUNDED" } },
        data: {
          status: "REFUNDED",
          refundAmount: body.amount,
          stripeRefundId,
          resolvedAt: new Date(),
          restockItems: body.restock,
        },
      });
      if (claimed.count === 0) return null;
      await tx.order.update({
        where: { id: order.id },
        data: {
          financialStatus: newFinancialStatus,
          // Full refund = order is refunded; partial = keep order status as-is
          ...(isPartial ? {} : { status: "REFUNDED" }),
        },
      });
      for (const line of restock) {
        if (line.action === "skip" || !line.variantId) continue;
        const inv = await tx.inventory.upsert({
          where: { variantId: line.variantId },
          update: { quantity: { increment: line.increment } },
          create: { tenantId, variantId: line.variantId, quantity: line.increment },
        });
        await tx.inventoryLog.create({
          data: {
            tenantId,
            inventoryId: inv.id,
            delta: line.increment,
            reason: "Return restock",
            note: `Return ${ret.id} (order ${order.orderNumber})${line.action === "create_inventory" ? "; inventory record created" : ""}`,
          },
        });
      }
      return tx.return.findUnique({ where: { id } });
    });
  } catch (err) {
    console.error(`[returns] DB update failed after refund for return ${ret.id}:`, err);
    if (stripeRefundId) {
      return fail(500, `The Stripe refund ${stripeRefundId} was issued, but the store records could not be updated. Retrying is safe: it will not refund the customer again.`, {
        moneyMoved: true,
        stripeRefundId,
      });
    }
    throw err;
  }
  if (!updated) {
    return fail(409, "This return has already been refunded", { stripeRefundId });
  }

  let emailSent = true;
  try {
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
    if (refundResult.error) throw new Error(refundResult.error.message);
    await logEmail({ tenantId: db.$tenantId, type: "REFUND_ISSUED", toEmail: order.email, fromEmail: branding.fromAddress, subject, resendId: refundResult.data?.id, relatedId: ret.id, relatedType: "RETURN" });
  } catch (err) {
    emailSent = false;
    console.error(`[returns] refund email failed for return ${ret.id}:`, err);
  }
  return ok({
    return: updated,
    stripeRefundId,
    moneyMoved: !!stripeRefundId,
    restocked: restock.filter((r) => r.action !== "skip"),
    warnings,
    emailSent,
  });
}
