/**
 * admin-services/orders.ts — order logic shared by /api/admin/orders/* and MCP.
 *
 * Extracted from the route handlers, plus read-only `preview*` functions used by
 * MCP write tools. Refund and cancel derive their Stripe idempotency keys from
 * stable ids, so the route and MCP can't move money twice for one action.
 */
import crypto from "crypto";
import Stripe from "stripe";
import { Resend } from "resend";
import { OrderStatus, FinancialStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { orderCancelledHtml } from "@/lib/emails/order-cancelled";
import { orderShippedHtml } from "@/lib/emails/order-shipped";
import { orderConfirmationHtml } from "@/lib/emails/order-confirmation";
import { getEmailBranding, emailLogoHtml } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
import { checkTracking } from "@/lib/tracking";
import { ok, fail, type ServiceResult } from "./result";
import { findEarlierRefund } from "./returns";

const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-01-27.acacia",
});

// ── list / get ──────────────────────────────────────────────────────────────

export interface OrderListParams {
  status?: string;
  financialStatus?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export function buildOrderWhere(p: OrderListParams): Prisma.OrderWhereInput {
  const { status = "", financialStatus = "", search = "", startDate = "", endDate = "" } = p;
  const where: Prisma.OrderWhereInput = {};
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status && Object.values(OrderStatus).includes(status as OrderStatus)) {
    where.status = status as OrderStatus;
  }
  if (financialStatus && Object.values(FinancialStatus).includes(financialStatus as FinancialStatus)) {
    where.financialStatus = financialStatus as FinancialStatus;
  }
  // Unparseable dates are ignored (like unknown status values), not a 500.
  const start = startDate ? new Date(startDate) : null;
  if (start && !isNaN(start.getTime())) {
    where.createdAt = { ...((where.createdAt as object) ?? {}), gte: start };
  }
  const end = endDate ? new Date(endDate) : null;
  if (end && !isNaN(end.getTime())) {
    end.setHours(23, 59, 59, 999);
    where.createdAt = { ...((where.createdAt as object) ?? {}), lte: end };
  }
  return where;
}

export async function exportOrdersCsv(db: TenantPrisma, p: OrderListParams): Promise<string> {
  const orders = await db.order.findMany({
    where: buildOrderWhere(p),
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { firstName: true, lastName: true } },
      _count: { select: { items: true } },
    },
  });
  const rows = [
    ["Order #", "Date", "Email", "Status", "Financial Status", "Total", "Items"],
    ...orders.map((o) => [
      o.orderNumber,
      new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(o.createdAt)),
      o.email,
      o.status,
      o.financialStatus,
      `$${(o.total / 100).toFixed(2)}`,
      String(o._count.items),
    ]),
  ];
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export async function listOrders(db: TenantPrisma, p: OrderListParams) {
  // parseInt of a junk query param is NaN; fall back to the defaults.
  const page = Math.max(1, Number.isFinite(p.page) ? (p.page as number) : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(p.limit) ? (p.limit as number) : 20));
  const where = buildOrderWhere(p);
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { items: true } },
        returns: { select: { id: true, status: true }, where: { status: { notIn: ["REJECTED"] } } },
      },
    }),
  ]);
  const ordersOut = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    financialStatus: o.financialStatus,
    email: o.email,
    phone: o.phone,
    total: o.total,
    currency: o.currency,
    itemsCount: o._count.items,
    customer: o.customer,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    activeReturnStatus: o.returns[0]?.status ?? null,
  }));
  return ok({ orders: ordersOut, total, page, totalPages: Math.ceil(total / limit) });
}

export async function getOrder(db: TenantPrisma, id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: true,
      fulfillments: { orderBy: { createdAt: "asc" } },
      returns: true,
    },
  });
  if (!order) return fail(404, "Order not found");
  return ok({ order });
}

/** MCP convenience: resolve an order by its human order number (e.g. "AS-1042"). */
export async function findOrderIdByNumber(db: TenantPrisma, orderNumber: string): Promise<string | null> {
  const o = await db.order.findFirst({ where: { orderNumber }, select: { id: true } });
  return o?.id ?? null;
}

// ── note ────────────────────────────────────────────────────────────────────

export async function setOrderNote(db: TenantPrisma, id: string, adminNote: string) {
  if (typeof adminNote !== "string") return fail(400, "adminNote must be a string");
  const existing = await db.order.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return fail(404, "Order not found");
  const order = await db.order.update({
    where: { id },
    data: { adminNote },
  });
  return ok({ order });
}

export async function previewOrderNote(db: TenantPrisma, id: string, adminNote: string) {
  const order = await db.order.findUnique({ where: { id }, select: { orderNumber: true, adminNote: true } });
  if (!order) return fail(404, "Order not found");
  return ok({ orderNumber: order.orderNumber, currentNote: order.adminNote, newNote: adminNote });
}

// ── deliver ─────────────────────────────────────────────────────────────────

async function deliverGuard(db: TenantPrisma, id: string) {
  const order = await db.order.findUnique({ where: { id } });
  if (!order) return fail(404, "Order not found");
  if (!["SHIPPED", "FULFILLED"].includes(order.status)) {
    return fail(400, "Order must be shipped before marking delivered");
  }
  return ok(order);
}

export async function previewDeliver(db: TenantPrisma, id: string) {
  const g = await deliverGuard(db, id);
  if (!g.ok) return g;
  return ok({ orderNumber: g.data.orderNumber, currentStatus: g.data.status, newStatus: "DELIVERED", emailsSent: [] });
}

export async function markOrderDelivered(db: TenantPrisma, id: string) {
  const g = await deliverGuard(db, id);
  if (!g.ok) return g;
  const updated = await db.order.update({
    where: { id },
    data: { status: "DELIVERED" },
  });
  return ok({ order: updated });
}

// ── cancel ──────────────────────────────────────────────────────────────────

/** Where an admin goes next when cancel is refused (named in every refusal). */
function orderPage(orderNumber: string) {
  return `Admin → Orders → ${orderNumber}`;
}

/** Stable Stripe idempotency keys: one key per order version and action. */
export function orderCancelIdempotencyKey(orderId: string, action: "refund" | "void", version?: Date): string {
  return version ? `order_cancel_${orderId}_${action}_${version.getTime()}` : `order_cancel_${orderId}_${action}`;
}

export interface CancelRestockLine {
  orderItemId: string;
  title: string;
  variantTitle: string | null;
  variantId: string | null;
  quantity: number;
  currentQuantity: number | null;
  newQuantity: number | null;
  action: "increment" | "skip";
  note?: string;
}

type CancelPayment =
  | { action: "stripe_refund"; amount: number; chargedAmount: number; alreadyRefunded: number }
  | { action: "record_existing_refund"; amount: number; stripeRefundId: string }
  | { action: "void_authorization" }
  | { action: "release_unpaid" }
  | { action: "none"; why: string };

interface CancelPlan {
  order: Prisma.OrderGetPayload<{ include: { items: true } }>;
  payment: CancelPayment;
  newFinancialStatus: FinancialStatus;
  restock: CancelRestockLine[];
}

const CLOSED: OrderStatus[] = ["CANCELLED", "REFUNDED"];

/**
 * Everything cancel will do, computed without changing anything. Shared by the
 * preview and the real cancel, so both refuse the same orders with the same
 * words. Reads Stripe (refund list, charge balance) but never writes to it.
 */
async function planCancel(db: TenantPrisma, id: string): Promise<ServiceResult<CancelPlan>> {
  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return fail(404, "Order not found");
  if (CLOSED.includes(order.status)) {
    return fail(400, "Order is already cancelled or refunded");
  }

  const shipped = order.items.filter((i) => i.fulfillmentStatus === "fulfilled");
  const unshipped = order.items.filter((i) => i.fulfillmentStatus !== "fulfilled");
  if (order.status === "DELIVERED" || (shipped.length > 0 && unshipped.length === 0)) {
    const what = order.status === "DELIVERED" ? "was delivered" : "has already shipped";
    return fail(409, `Order ${order.orderNumber} ${what}, so it can't be cancelled. Create a return instead: use the returns_create tool, or the "Create return" button on the order page (${orderPage(order.orderNumber)}). When the items come back, refund them with returns_refund.`, {
      nextAction: { tool: "returns_create", adminPage: `/admin/orders/${order.id}` },
    });
  }
  if (shipped.length > 0) {
    const unshippedValue = unshipped.reduce((sum, i) => sum + i.total, 0);
    return fail(409, `Order ${order.orderNumber} is partly shipped (${shipped.map((i) => `${i.quantity}× ${i.title}`).join(", ")}), so it can't be cancelled as a whole. Create a return for the shipped items (returns_create, or "Create return" on ${orderPage(order.orderNumber)}), and refund the items that haven't shipped with orders_refund (or "Issue Refund" on the same page): they come to ${unshippedValue} cents before shipping and tax.`, {
      nextAction: { tools: ["returns_create", "orders_refund"], adminPage: `/admin/orders/${order.id}` },
      shippedItems: shipped.map((i) => ({ orderItemId: i.id, title: i.title, quantity: i.quantity })),
      unshippedItems: unshipped.map((i) => ({ orderItemId: i.id, title: i.title, quantity: i.quantity, total: i.total })),
      unshippedValue,
    });
  }

  // ── payment ──
  const pi = order.stripePaymentIntentId;
  let payment: CancelPayment;
  let newFinancialStatus: FinancialStatus = order.financialStatus;
  if (pi && (order.financialStatus === "PAID" || order.financialStatus === "PARTIALLY_REFUNDED")) {
    try {
      // A refund an earlier cancel attempt issued (and failed to record) is
      // reused, so a retry never refunds twice.
      const earlier = await findEarlierRefund(stripe, pi, (m) => m.orderId === order.id && m.cancel === "true");
      if (earlier) {
        payment = { action: "record_existing_refund", amount: earlier.amount, stripeRefundId: earlier.id };
      } else {
        const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
        const latest = intent.latest_charge as Stripe.Charge | string | null;
        const charge = !latest ? null : typeof latest === "string" ? await stripe.charges.retrieve(latest) : latest;
        if (!charge) {
          payment = { action: "none", why: "Stripe has no captured charge on this payment, so there is nothing to refund." };
        } else {
          const alreadyRefunded = charge.amount_refunded ?? 0;
          const remaining = charge.amount - alreadyRefunded;
          payment = remaining > 0
            ? { action: "stripe_refund", amount: remaining, chargedAmount: charge.amount, alreadyRefunded }
            : { action: "none", why: "The Stripe charge is already fully refunded." };
        }
      }
    } catch (err) {
      return fail(502, `Couldn't check the payment with Stripe, so the order was not cancelled: ${errMessage(err)}. Nothing changed; try again in a minute.`, {
        done: false, blocked: true, retrySafe: true, moneyMoved: false,
      });
    }
    newFinancialStatus = "REFUNDED";
  } else if (pi && order.financialStatus === "AUTHORIZED") {
    payment = { action: "void_authorization" };
    newFinancialStatus = "VOIDED";
  } else if (pi && order.financialStatus === "PENDING") {
    payment = { action: "release_unpaid" };
    newFinancialStatus = "VOIDED";
  } else {
    payment = { action: "none", why: pi ? `Payment status is ${order.financialStatus}; nothing to refund or release.` : "No card payment on this order." };
  }

  return ok({ order, payment, newFinancialStatus, restock: await planCancelRestock(db, order) });
}

/**
 * Which unshipped items go back on the shelf. Checkout (/api/checkout/confirm)
 * takes stock only for variants that had an inventory row, and the hosted
 * checkout-session flow never takes stock, so only that is given back. Items
 * already restocked by a refunded return are not counted twice.
 */
async function planCancelRestock(db: TenantPrisma, order: CancelPlan["order"]): Promise<CancelRestockLine[]> {
  const unshipped = order.items.filter((i) => i.fulfillmentStatus !== "fulfilled");
  const base = (i: (typeof unshipped)[number]) => ({ orderItemId: i.id, title: i.title, variantTitle: i.variantTitle, variantId: i.variantId });
  if (order.stripeCheckoutSessionId) {
    return unshipped.map((i) => ({ ...base(i), quantity: 0, currentQuantity: null, newQuantity: null, action: "skip" as const, note: "Hosted-checkout orders never took stock, so nothing is given back." }));
  }
  const returned = await db.returnItem.findMany({
    where: { orderItemId: { in: unshipped.map((i) => i.id) }, return: { status: "REFUNDED", restockItems: true } },
    select: { orderItemId: true, quantity: true },
  });
  const alreadyBack = new Map<string, number>();
  for (const r of returned) alreadyBack.set(r.orderItemId, (alreadyBack.get(r.orderItemId) ?? 0) + r.quantity);
  const variantIds = unshipped.map((i) => i.variantId).filter((v): v is string => !!v);
  const inv = await db.inventory.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, quantity: true } });
  const qty = new Map(inv.map((r) => [r.variantId, r.quantity]));
  return unshipped.map((i) => {
    const quantity = Math.max(0, i.quantity - (alreadyBack.get(i.id) ?? 0));
    const current = i.variantId ? qty.get(i.variantId) : undefined;
    if (quantity === 0) return { ...base(i), quantity: 0, currentQuantity: current ?? null, newQuantity: current ?? null, action: "skip" as const, note: "Already restocked by a refunded return." };
    if (current === undefined) {
      return { ...base(i), quantity: 0, currentQuantity: null, newQuantity: null, action: "skip" as const, note: "No inventory record for this item, so checkout took no stock and none is given back." };
    }
    return { ...base(i), quantity, currentQuantity: current, newQuantity: current + quantity, action: "increment" as const };
  });
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function describePayment(p: CancelPayment): string {
  switch (p.action) {
    case "stripe_refund":
      return p.alreadyRefunded > 0
        ? `Refund the remaining ${p.amount} cents ($${(p.amount / 100).toFixed(2)}) to the customer's card via Stripe (charged ${p.chargedAmount}, already refunded ${p.alreadyRefunded}).`
        : `Full refund of ${p.amount} cents ($${(p.amount / 100).toFixed(2)}) to the customer's card via Stripe.`;
    case "record_existing_refund":
      return `An earlier cancel attempt already refunded ${p.amount} cents (${p.stripeRefundId}) but didn't finish. No new money moves; the order is just recorded as cancelled.`;
    case "void_authorization":
      return "Release the uncaptured card authorization (no money moves, no fee).";
    case "release_unpaid":
      return "The customer never paid. The open payment is released so it can't be paid later; if Stripe is unreachable the order is cancelled anyway.";
    case "none":
      return `No payment action: ${p.why}`;
  }
}

export async function previewCancel(db: TenantPrisma, id: string, reason: string) {
  const planned = await planCancel(db, id);
  if (!planned.ok) return planned;
  const { order, payment, newFinancialStatus, restock } = planned.data;
  const refundAmount = payment.action === "stripe_refund" || payment.action === "record_existing_refund" ? payment.amount : 0;
  const refunded = newFinancialStatus === "REFUNDED";
  return ok({
    orderNumber: order.orderNumber,
    currentStatus: order.status,
    currentFinancialStatus: order.financialStatus,
    newStatus: "CANCELLED",
    expectedFinancialStatus: newFinancialStatus,
    orderTotal: order.total,
    refundAmount,
    refundAmountFormatted: `$${(refundAmount / 100).toFixed(2)}`,
    paymentAction: describePayment(payment),
    payment,
    restock,
    reason,
    email: {
      to: order.email,
      subject: `Your order ${order.orderNumber} has been cancelled`,
      type: refunded ? "ORDER_REFUNDED" : "ORDER_CANCELLED",
    },
    note: "Money first: if the Stripe refund or release fails, the order is NOT cancelled, nothing is restocked, and retrying is safe (it never refunds twice).",
  });
}

/**
 * Cancel an order, money first:
 *   1. Plan (same guards as the preview). Delivered, shipped and partly shipped
 *      orders are refused with the next step to take.
 *   2. Stripe: refund the remaining balance, or release the authorization. If
 *      that fails, stop: the order keeps its status and nothing is restocked.
 *      The failure is noted on the order, which also moves its version, so the
 *      retry gets a fresh idempotency key instead of Stripe's cached error.
 *      A refund that did go through is found by metadata and reused.
 *   3. One transaction: status-conditional claim (concurrent cancels record
 *      once), restock, inventory logs.
 *   4. Customer email. A send failure is reported, never undone.
 */
export async function cancelOrder(db: TenantPrisma, id: string, reason: string) {
  const planned = await planCancel(db, id);
  if (!planned.ok) return planned;
  const { order, payment, newFinancialStatus, restock } = planned.data;
  const pi = order.stripePaymentIntentId as string;

  let refundedAmount = 0;
  let stripeRefundId: string | null = null;
  let paymentError: string | null = null;
  try {
    if (payment.action === "record_existing_refund") {
      refundedAmount = payment.amount;
      stripeRefundId = payment.stripeRefundId;
    } else if (payment.action === "stripe_refund") {
      const refund = await stripe.refunds.create(
        { payment_intent: pi, amount: payment.amount, reason: "requested_by_customer", metadata: { orderId: order.id, cancel: "true" } },
        { idempotencyKey: orderCancelIdempotencyKey(order.id, "refund", order.updatedAt) },
      );
      refundedAmount = refund.amount;
      stripeRefundId = refund.id;
    } else if (payment.action === "void_authorization") {
      await stripe.paymentIntents.cancel(pi, undefined, { idempotencyKey: orderCancelIdempotencyKey(order.id, "void", order.updatedAt) });
    }
  } catch (err) {
    console.error(`Stripe ${payment.action} failed on cancel for order ${order.orderNumber}:`, err);
    const what = payment.action === "void_authorization" ? "Releasing the card authorization" : "The Stripe refund";
    const reasonText = `${what} failed, so order ${order.orderNumber} was NOT cancelled and nothing was restocked: ${errMessage(err)}. It's safe to try again (the customer can't be refunded twice). If it keeps failing, check the payment in Stripe.`;
    const noteLine = `Cancel attempt failed (${new Date().toISOString().slice(0, 10)}): ${what.toLowerCase()} failed: ${errMessage(err)}. Order not cancelled.`;
    await db.order.updateMany({
      where: { id, status: { notIn: CLOSED } },
      data: { adminNote: order.adminNote ? `${order.adminNote}\n\n${noteLine}` : noteLine },
    }).catch((e) => console.error("Could not note the failed cancel attempt:", e));
    return fail(502, reasonText, {
      done: false,
      blocked: true,
      reason: reasonText,
      retrySafe: true,
      moneyMoved: false,
      retry: "Safe to retry: nothing was cancelled and no money moved. Request a new preview and confirm again.",
    });
  }
  if (payment.action === "release_unpaid") {
    // Unpaid: no money is held, so a Stripe problem never blocks the cancel.
    try {
      await stripe.paymentIntents.cancel(pi, undefined, { idempotencyKey: orderCancelIdempotencyKey(order.id, "void") });
    } catch (err) {
      console.warn(`Could not release the unpaid payment for order ${order.orderNumber}:`, err);
      paymentError = `The order is cancelled, but releasing its unpaid Stripe payment failed: ${errMessage(err)}. No money was taken.`;
    }
  }

  const tenantId = db.$tenantId;
  const restocked = restock.filter((l) => l.action === "increment");
  let updatedOrder;
  try {
    updatedOrder = await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id, status: { notIn: [...CLOSED, "DELIVERED"] } },
        data: {
          status: "CANCELLED",
          financialStatus: newFinancialStatus,
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });
      if (claimed.count === 0) return null;
      for (const line of restocked) {
        const inv = await tx.inventory.update({
          where: { variantId: line.variantId as string },
          data: { quantity: { increment: line.quantity } },
        });
        await tx.inventoryLog.create({
          data: { tenantId, inventoryId: inv.id, delta: line.quantity, reason: "Order cancelled", note: `Order ${order.orderNumber}: ${line.title}${line.variantTitle ? ` (${line.variantTitle})` : ""}` },
        });
      }
      return tx.order.findUniqueOrThrow({ where: { id } });
    });
  } catch (err) {
    console.error(`DB update failed on cancel for order ${order.orderNumber}:`, err);
    if (stripeRefundId || payment.action === "void_authorization") {
      return fail(500, `Stripe ${stripeRefundId ? `refund ${stripeRefundId}` : "release"} went through, but the order could not be marked cancelled. Retrying is safe: it reuses that refund and won't charge or refund the customer again.`, {
        moneyMoved: !!stripeRefundId, retrySafe: true, ...(stripeRefundId ? { refundId: stripeRefundId } : {}),
      });
    }
    throw err;
  }
  if (!updatedOrder) return fail(409, "Order was cancelled by another request");
  const refunded = newFinancialStatus === "REFUNDED";

  // Send cancellation email
  let emailSent = true;
  try {
    const customer = updatedOrder.customerId
      ? await db.customer.findUnique({ where: { id: updatedOrder.customerId }, select: { firstName: true } })
      : null;
    const branding = await getEmailBranding(db.$tenantId);
    const html = orderCancelledHtml({
      orderNumber: updatedOrder.orderNumber,
      email: updatedOrder.email,
      firstName: customer?.firstName ?? undefined,
      cancelReason: reason || undefined,
      refunded: refundedAmount > 0,
      total: refundedAmount,
    }, branding);
    const result = await resend.emails.send({
      from: branding.from,
      to: updatedOrder.email,
      replyTo: branding.replyTo ?? branding.fromAddress,
      subject: `Your order ${updatedOrder.orderNumber} has been cancelled`,
      html,
    });
    if (result.error) throw new Error(result.error.message);
    const type = refunded ? "ORDER_REFUNDED" as const : "ORDER_CANCELLED" as const;
    await logEmail({ tenantId: db.$tenantId, type, toEmail: updatedOrder.email, fromEmail: branding.fromAddress, subject: `Your order ${updatedOrder.orderNumber} has been cancelled`, bodyHtml: html, resendId: result.data?.id, relatedId: updatedOrder.id, relatedType: "ORDER" });
  } catch (emailErr) {
    emailSent = false;
    console.error("Failed to send cancellation email:", emailErr);
  }

  return ok({
    order: updatedOrder,
    refunded,
    refundedAmount,
    stripeRefundId,
    restocked: restocked.map((l) => ({ title: l.title, variantTitle: l.variantTitle, quantity: l.quantity, newQuantity: l.newQuantity })),
    paymentError,
    emailSent,
  });
}

// ── refund ──────────────────────────────────────────────────────────────────

export interface RefundBody {
  amount?: number;
  reason?: string;
}

async function refundGuard(db: TenantPrisma, id: string, body: RefundBody) {
  // Omitted amount = full refund. Anything else must be whole positive cents:
  // 0, negatives, fractions or strings used to fall through to a FULL refund.
  const amount: unknown = body?.amount;
  if (amount !== undefined && amount !== null && !(typeof amount === "number" && Number.isInteger(amount) && amount > 0)) {
    return fail(400, "amount must be a positive whole number of cents (omit it for a full refund)");
  }
  const order = await db.order.findUnique({ where: { id } });
  if (!order) return fail(404, "Order not found");

  if (!["PAID", "PARTIALLY_REFUNDED"].includes(order.financialStatus)) {
    const hint = order.financialStatus === "AUTHORIZED"
      ? "Payment is authorized but not yet captured. Cancel the order to release the hold with no fees."
      : "Order is not in a refundable state";
    return fail(400, hint);
  }

  if (!order.stripePaymentIntentId) {
    return fail(400, "No Stripe payment found for this order");
  }
  return ok(order);
}

export async function previewRefund(db: TenantPrisma, id: string, body: RefundBody) {
  const g = await refundGuard(db, id, body);
  if (!g.ok) return g;
  const order = g.data;
  const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId as string, { expand: ["latest_charge"] });
  const charge = pi.latest_charge as Stripe.Charge | string | null;
  if (!charge) return fail(400, "No charge found on this payment");
  const chargeObj = typeof charge === "string" ? await stripe.charges.retrieve(charge) : charge;
  const alreadyRefunded = chargeObj.amount_refunded ?? 0;
  const refundable = chargeObj.amount - alreadyRefunded;
  const requested = body.amount && body.amount > 0 ? body.amount : undefined;
  if (requested && requested > refundable) {
    return fail(400, `Refund amount ${requested} exceeds the refundable balance of ${refundable} cents`);
  }
  if (refundable <= 0) return fail(409, "This charge has already been fully refunded");
  const refundAmount = requested ?? refundable;
  const isFullRefund = refundAmount >= refundable;
  return ok({
    orderNumber: order.orderNumber,
    orderTotal: order.total,
    chargedAmount: chargeObj.amount,
    alreadyRefunded,
    refundAmount,
    refundAmountFormatted: `$${(refundAmount / 100).toFixed(2)}`,
    refundType: isFullRefund ? "full" : "partial",
    newFinancialStatus: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
    newStatus: isFullRefund ? "REFUNDED" : order.status,
    reason: body.reason ?? "Admin initiated",
    email: { to: order.email, subject: `Refund issued for order ${order.orderNumber}`, type: "ORDER_REFUNDED" },
  });
}

/**
 * Stable Stripe idempotency key for an order refund. It is tied to the order row
 * version (updatedAt) the admin acted on: a double submit or a retry after a
 * failed DB write sees the same version and replays the same refund, while a
 * later, deliberate refund (after the first was recorded) gets a new key.
 */
export function orderRefundIdempotencyKey(orderId: string, version: Date, amount: number | undefined): string {
  return `order_refund_${orderId}_${version.getTime()}_${amount ?? "full"}`;
}

export async function refundOrder(db: TenantPrisma, id: string, body: RefundBody) {
  const g = await refundGuard(db, id, body);
  if (!g.ok) return g;
  const order = g.data;
  const piId = order.stripePaymentIntentId as string;

  // Refund amount: partial if specified, full (remaining balance) if not
  const refundAmount = body.amount && body.amount > 0 ? body.amount : undefined;

  // The order version this refund acts on. A retry after a failed DB write sees
  // the same version, finds the earlier refund by metadata, and reuses it.
  const version = String(order.updatedAt.getTime());
  let refund: Stripe.Refund;
  try {
    const earlier = await findEarlierRefund(stripe, piId, (m) => m.orderId === order.id && m.orderVersion === version);
    refund = earlier ?? await stripe.refunds.create({
      payment_intent: piId,
      ...(refundAmount ? { amount: refundAmount } : {}),
      reason: "requested_by_customer",
      metadata: { orderId: order.id, orderVersion: version },
    }, { idempotencyKey: orderRefundIdempotencyKey(order.id, order.updatedAt, refundAmount) });
  } catch (err) {
    console.error(`Stripe refund failed for order ${order.orderNumber}:`, err);
    return fail(502, `Stripe refund failed, nothing was changed: ${err instanceof Error ? err.message : String(err)}`, { moneyMoved: false });
  }

  // Full vs partial comes from the charge AFTER the refund, so the refund that
  // empties the balance marks the order REFUNDED even if it was "partial".
  let isFullRefund = !refundAmount || refundAmount >= order.total;
  try {
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
    const charge = pi.latest_charge as Stripe.Charge | string | null;
    if (charge && typeof charge !== "string") {
      isFullRefund = charge.refunded || charge.amount_refunded >= charge.amount;
    }
  } catch (err) {
    console.error("Could not read the charge after refund; falling back to the order total:", err);
  }
  const newFinancialStatus = isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED";
  const newStatus = isFullRefund ? "REFUNDED" : order.status;
  const noteLine = `Refund issued: ${body.reason ?? "Admin initiated"} (${new Date().toLocaleDateString()})`;

  try {
    // Conditional on the version we acted on: a concurrent duplicate that
    // replayed the same Stripe refund records nothing a second time.
    const claimed = await db.order.updateMany({
      where: { id, updatedAt: order.updatedAt },
      data: {
        financialStatus: newFinancialStatus,
        status: newStatus,
        adminNote: order.adminNote ? `${order.adminNote}\n\n${noteLine}` : noteLine,
      },
    });
    if (claimed.count === 0) {
      // Another request recorded this refund; don't email the customer twice.
      return ok({ success: true, refundId: refund.id, amount: refund.amount, status: refund.status, financialStatus: newFinancialStatus, emailSent: false, alreadyRecorded: true });
    }
  } catch (err) {
    console.error(`DB update failed after refund ${refund.id} for order ${order.orderNumber}:`, err);
    return fail(500, `The Stripe refund ${refund.id} was issued, but the order could not be updated. Retrying is safe: it will not refund the customer again.`, {
      moneyMoved: true,
      refundId: refund.id,
    });
  }

  // Send refund notification email
  let emailSent = true;
  try {
    const refundAmt = refund.amount;
    const branding = await getEmailBranding(db.$tenantId);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;"><tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="padding:32px 40px 20px;text-align:center;border-bottom:1px solid #ede8df;">
${emailLogoHtml(branding)}</td></tr>
<tr><td style="padding:36px 40px;text-align:center;">
<h2 style="margin:0 0 12px;font-size:24px;color:#3a2e24;font-weight:700;">Refund Issued</h2>
<p style="margin:0 0 20px;font-size:15px;color:#7a6852;">A refund of <strong>$${(refundAmt / 100).toFixed(2)}</strong> has been issued for order <strong>${order.orderNumber}</strong>.</p>
<p style="margin:0;font-size:13px;color:#9a876e;">Refunds typically appear within 5–10 business days. Questions? <a href="mailto:${branding.fromAddress}" style="color:${branding.accentColor};">${branding.fromAddress}</a></p>
</td></tr>
<tr><td style="padding:20px 40px;background:#3a2e24;text-align:center;"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.4);">&copy; ${new Date().getFullYear()} ${branding.storeName}</p></td></tr>
</table></td></tr></table></body></html>`;
    const emailResult = await resend.emails.send({
      from: branding.from,
      to: order.email,
      replyTo: branding.replyTo ?? branding.fromAddress,
      subject: `Refund issued for order ${order.orderNumber}`,
      html,
    });
    if (emailResult.error) throw new Error(emailResult.error.message);
    await logEmail({ tenantId: db.$tenantId, type: "ORDER_REFUNDED", toEmail: order.email, fromEmail: branding.fromAddress, subject: `Refund issued for order ${order.orderNumber}`, bodyHtml: html, resendId: emailResult.data?.id, relatedId: order.id, relatedType: "ORDER" });
  } catch (emailErr) {
    emailSent = false;
    console.error("Failed to send refund email:", emailErr);
  }

  return ok({
    success: true,
    refundId: refund.id,
    amount: refund.amount,
    status: refund.status,
    financialStatus: newFinancialStatus,
    emailSent,
    alreadyRecorded: false,
  });
}

// ── fulfill ─────────────────────────────────────────────────────────────────

export interface FulfillBody {
  trackingCompany: string;
  trackingNumber: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  notifyCustomer: boolean;
  items: Array<{ orderItemId: string; quantity: number }>;
}

/** Fulfilling a closed order would flip it back to SHIPPED and email the customer. */
const FULFILL_CLOSED_ERROR = "Order is cancelled or refunded and cannot be fulfilled";

export async function previewFulfill(db: TenantPrisma, id: string, body: FulfillBody) {
  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return fail(404, "Order not found");
  if (order.status === "CANCELLED" || order.status === "REFUNDED") return fail(400, FULFILL_CLOSED_ERROR);
  const known = new Map(order.items.map((i) => [i.id, i]));
  const unknown = body.items.filter((i) => !known.has(i.orderItemId)).map((i) => i.orderItemId);
  if (unknown.length) return fail(400, `Order item(s) not on this order: ${unknown.join(", ")}`);
  const selected = new Set(body.items.map((i) => i.orderItemId));
  const allFulfilled = order.items.every((i) => i.fulfillmentStatus === "fulfilled" || selected.has(i.id));
  const willCapture = allFulfilled && order.financialStatus === "AUTHORIZED" && !!order.stripePaymentIntentId;
  return ok({
    orderNumber: order.orderNumber,
    currentStatus: order.status,
    items: body.items.map((i) => ({
      orderItemId: i.orderItemId,
      title: known.get(i.orderItemId)?.title,
      quantity: i.quantity,
      alreadyFulfilled: known.get(i.orderItemId)?.fulfillmentStatus === "fulfilled",
    })),
    allItemsFulfilledAfter: allFulfilled,
    newStatus: allFulfilled ? (body.trackingNumber?.trim() ? "SHIPPED" : "FULFILLED") : order.status,
    paymentCapture: willCapture
      ? { amount: order.total, note: "The authorized card payment will be captured via Stripe (money moves)." }
      : null,
    tracking: { company: body.trackingCompany, number: body.trackingNumber, url: body.trackingUrl ?? null },
    email: body.notifyCustomer
      ? { to: order.email, subject: `Your order ${order.orderNumber} has shipped!`, type: "ORDER_SHIPPED" }
      : null,
  });
}

export async function fulfillOrder(db: TenantPrisma, id: string, body: FulfillBody) {
  const order = await db.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) return fail(404, "Order not found");
  if (order.status === "CANCELLED" || order.status === "REFUNDED") return fail(400, FULFILL_CLOSED_ERROR);
  const known = new Set(order.items.map((i) => i.id));
  const unknownItems = (body.items ?? []).filter((i) => !known.has(i.orderItemId)).map((i) => i.orderItemId);
  if (!body.items?.length) return fail(400, "Select at least one item to fulfill");
  if (unknownItems.length) return fail(400, `Order item(s) not on this order: ${unknownItems.join(", ")}`);

  // Fulfillment record + item statuses land together or not at all.
  const tenantId = db.$tenantId;
  const { fulfillment, allFulfilled } = await db.$transaction(async (tx) => {
    const fulfillment = await tx.fulfillment.create({
      data: {
        tenantId,
        orderId: id,
        status: "SUCCESS",
        trackingCompany: body.trackingCompany,
        trackingNumber: body.trackingNumber,
        trackingUrl: body.trackingUrl ?? null,
        shippedAt: new Date(),
        estimatedDelivery: body.estimatedDelivery ? new Date(body.estimatedDelivery) : null,
        notifyCustomer: body.notifyCustomer,
        items: body.items,
      },
    });
    await tx.orderItem.updateMany({
      where: { orderId: id, id: { in: body.items.map((fi) => fi.orderItemId) } },
      data: { fulfillmentStatus: "fulfilled" },
    });
    const updatedItems = await tx.orderItem.findMany({ where: { orderId: id } });
    return { fulfillment, allFulfilled: updatedItems.every((item) => item.fulfillmentStatus === "fulfilled") };
  });

  // Capture payment if authorized (manual capture mode). The key is per order:
  // a payment intent is captured once, so a retry replays instead of failing.
  let newFinancialStatus = order.financialStatus;
  let paymentError: string | null = null;
  if (allFulfilled && order.financialStatus === "AUTHORIZED" && order.stripePaymentIntentId) {
    try {
      await stripe.paymentIntents.capture(order.stripePaymentIntentId, undefined, { idempotencyKey: `order_capture_${order.id}` });
      newFinancialStatus = "PAID";
      console.log(`Captured payment for order ${order.orderNumber}`);
    } catch (captureErr) {
      // Log but don't block fulfillment — handle manually if needed
      console.error("Failed to capture Stripe payment on fulfill:", captureErr);
      paymentError = `Capturing the card payment failed: ${captureErr instanceof Error ? captureErr.message : String(captureErr)}. Capture it manually in Stripe.`;
    }
  }

  if (allFulfilled) {
    // If tracking was provided, order is now SHIPPED; otherwise FULFILLED (packed, awaiting carrier)
    const newStatus = body.trackingNumber?.trim() ? "SHIPPED" : "FULFILLED";
    await db.order.update({
      where: { id },
      data: {
        status: newStatus,
        financialStatus: newFinancialStatus,
      },
    });
  }
  // Send shipped email
  let emailSent = true;
  if (body.notifyCustomer) {
    const emailItems = order.items.map((item) => {
      const snapshot = item.productSnapshot as Record<string, unknown>;
      return {
        title: item.title,
        variantTitle: item.variantTitle ?? undefined,
        quantity: item.quantity,
        image: (snapshot?.image as string) ?? undefined,
      };
    });

    // Generate pre-auth magic link for shipped email (7 day expiry)
    let viewOrderUrl: string | undefined;
    try {
      const mlToken = crypto.randomBytes(32).toString("hex");
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
      // Intentional global-prisma exemption: MagicLinkToken is NOT a tenant-scoped
      // model — it's keyed by its globally-unique secret `token` and excluded from
      // TENANT_SCOPED_MODELS. The tenant is passed explicitly (db.$tenantId), so this
      // is correct by design; the scoped client would not auto-stamp it.
      await prisma.magicLinkToken.create({
        data: {
          tenantId: db.$tenantId,
          token: mlToken,
          email: order.email,
          type: "CUSTOMER",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      viewOrderUrl = `${siteUrl}/api/auth/customer/verify?token=${encodeURIComponent(mlToken)}&redirect=${encodeURIComponent('/account/orders/' + order.orderNumber)}`;
    } catch (mlErr) {
      console.error("Failed to create magic link for shipped email:", mlErr);
    }

    try {
      const branding = await getEmailBranding(db.$tenantId);
      const shippedHtml = orderShippedHtml({ orderNumber: order.orderNumber, email: order.email, trackingCompany: body.trackingCompany, trackingNumber: body.trackingNumber, trackingUrl: body.trackingUrl, estimatedDelivery: body.estimatedDelivery, items: emailItems, viewOrderUrl }, branding);
      const shipResult = await resend.emails.send({
        from: branding.from,
        to: order.email,
        replyTo: branding.replyTo ?? branding.fromAddress,
        subject: `Your order ${order.orderNumber} has shipped!`,
        html: shippedHtml,
      });
      if (shipResult.error) throw new Error(shipResult.error.message);
      await logEmail({ tenantId: db.$tenantId, type: "ORDER_SHIPPED", toEmail: order.email, fromEmail: branding.fromAddress, subject: `Your order ${order.orderNumber} has shipped!`, bodyHtml: shippedHtml, resendId: shipResult.data?.id, relatedId: order.id, relatedType: "ORDER" });
    } catch (emailErr) {
      emailSent = false;
      console.error("Failed to send shipped email:", emailErr);
    }
  }
  return ok({ fulfillment, paymentError, ...(body.notifyCustomer ? { emailSent } : {}) });
}

// ── resend confirmation email ───────────────────────────────────────────────

export async function previewResendConfirmation(db: TenantPrisma, id: string) {
  const order = await db.order.findUnique({ where: { id }, select: { orderNumber: true, email: true, total: true } });
  if (!order) return fail(404, "Order not found");
  const previous = await db.emailLog.count({ where: { relatedId: id, type: "ORDER_CONFIRMATION" } });
  return ok({
    orderNumber: order.orderNumber,
    email: { to: order.email, subject: `Order Confirmed — ${order.orderNumber}`, type: "ORDER_CONFIRMATION" },
    confirmationEmailsAlreadySent: previous,
    orderTotal: order.total,
  });
}

export async function resendOrderConfirmation(db: TenantPrisma, id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) return fail(404, "Order not found");
  const shippingAddress = order.shippingAddress as {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  const emailItems = order.items.map((item) => {
    const snapshot = item.productSnapshot as Record<string, unknown>;
    return {
      title: item.title,
      variantTitle: item.variantTitle ?? undefined,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      image: (snapshot?.image as string) ?? undefined,
    };
  });
  const branding = await getEmailBranding(db.$tenantId);
  const confirmHtml = orderConfirmationHtml({
    orderNumber: order.orderNumber,
    email: order.email,
    items: emailItems,
    subtotal: order.subtotal,
    shippingTotal: order.shippingTotal,
    taxTotal: order.taxTotal,
    discountTotal: order.discountTotal,
    total: order.total,
    shippingAddress,
  }, branding);
  const resendResult = await resend.emails.send({
    from: branding.from,
    to: order.email,
    replyTo: branding.replyTo ?? branding.fromAddress,
    subject: `Order Confirmed — ${order.orderNumber}`,
    html: confirmHtml,
  });
  if (resendResult.error) {
    return fail(502, `The email provider rejected the confirmation email: ${resendResult.error.message}`);
  }
  await logEmail({ tenantId: db.$tenantId, type: "ORDER_CONFIRMATION", toEmail: order.email, fromEmail: branding.fromAddress, subject: `Order Confirmed — ${order.orderNumber}`, bodyHtml: confirmHtml, resendId: resendResult.data?.id, relatedId: order.id, relatedType: "ORDER" });
  return ok({ ok: true });
}

// ── check tracking ──────────────────────────────────────────────────────────

async function shippedOrdersWithTracking(db: TenantPrisma) {
  return db.order.findMany({
    where: { status: "SHIPPED" },
    include: {
      fulfillments: {
        where: { trackingNumber: { not: null } },
        orderBy: { shippedAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function previewCheckTracking(db: TenantPrisma) {
  const shipped = await shippedOrdersWithTracking(db);
  const checkable = shipped.filter((o) => o.fulfillments[0]?.trackingNumber && o.fulfillments[0]?.trackingCompany);
  return ok({
    ordersToCheck: checkable.map((o) => ({
      orderNumber: o.orderNumber,
      carrier: o.fulfillments[0].trackingCompany,
      trackingNumber: o.fulfillments[0].trackingNumber,
    })),
    effect: "Queries USPS/UPS for each order; any the carrier reports as delivered are set to DELIVERED. No emails are sent.",
  });
}

export async function checkShippedTracking(db: TenantPrisma): Promise<ServiceResult<unknown>> {
  // Find all SHIPPED orders that have a tracking number
  const shippedOrders = await shippedOrdersWithTracking(db);

  if (shippedOrders.length === 0) {
    return ok({ checked: 0, delivered: 0, results: [], message: "No shipped orders to check" });
  }

  const results: Array<{
    orderId: string;
    orderNumber: string;
    carrier: string;
    trackingNumber: string;
    status: string;
    description: string;
    changed: boolean;
  }> = [];

  let deliveredCount = 0;

  for (const order of shippedOrders) {
    const fulfillment = order.fulfillments[0];
    if (!fulfillment?.trackingNumber || !fulfillment.trackingCompany) continue;

    const result = await checkTracking(fulfillment.trackingCompany, fulfillment.trackingNumber);

    let changed = false;
    if (result.status === "delivered") {
      await db.order.update({
        where: { id: order.id },
        data: { status: "DELIVERED" },
      });
      changed = true;
      deliveredCount++;
    }

    results.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      carrier: fulfillment.trackingCompany,
      trackingNumber: fulfillment.trackingNumber,
      status: result.status,
      description: result.description,
      changed,
    });

    // Small delay to be polite to carrier APIs
    await new Promise(r => setTimeout(r, 200));
  }

  return ok({
    checked: results.length,
    delivered: deliveredCount,
    results,
    message: deliveredCount > 0
      ? `${deliveredCount} order${deliveredCount !== 1 ? "s" : ""} marked as delivered`
      : "No new deliveries detected",
  });
}
