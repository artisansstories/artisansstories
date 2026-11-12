/**
 * Orders — mirrors /api/admin/orders/* via src/lib/admin-services/orders.ts.
 */
import { z } from "zod";
import { readTool, writeTool, zId, zPage, zLimit, type McpTool } from "../kit";
import * as svc from "@/lib/admin-services/orders";

const ORDER_STATUS = ["PENDING", "PROCESSING", "FULFILLED", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const;
const FINANCIAL_STATUS = ["PENDING", "AUTHORIZED", "PAID", "PARTIALLY_PAID", "REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"] as const;

export const tools: McpTool[] = [
  readTool({
    name: "orders_list",
    title: "List orders",
    description:
      "List orders newest first, with optional filters on status, payment status, date range, and a search over order number and customer email. Returns id, orderNumber, status, financialStatus, total (cents), item count, customer, and any active return status.",
    input: {
      status: z.enum(ORDER_STATUS).nullish().describe("Fulfillment status filter"),
      financialStatus: z.enum(FINANCIAL_STATUS).nullish().describe("Payment status filter"),
      search: z.string().nullish().describe("Matches order number or customer email (case-insensitive)"),
      startDate: z.string().nullish().describe("Earliest order date, YYYY-MM-DD"),
      endDate: z.string().nullish().describe("Latest order date, YYYY-MM-DD (inclusive)"),
      page: zPage,
      limit: zLimit(100, 20),
    },
    run: (ctx, a) => svc.listOrders(ctx.db, a),
  }),

  readTool({
    name: "orders_get",
    title: "Get order",
    description:
      "Get one order with its customer, line items, fulfillments (tracking), and returns. Pass either the order id or the human order number.",
    input: {
      orderId: z.string().nullish().describe("Order id"),
      orderNumber: z.string().nullish().describe("Order number as shown to customers"),
    },
    run: async (ctx, a) => {
      const id = a.orderId ?? (a.orderNumber ? await svc.findOrderIdByNumber(ctx.db, a.orderNumber) : null);
      if (!id) return { ok: false, status: 404, body: { error: "Order not found. Provide orderId or a valid orderNumber." } };
      return svc.getOrder(ctx.db, id);
    },
  }),

  writeTool({
    name: "orders_set_note",
    title: "Set order admin note",
    kind: "write",
    idempotent: true,
    description: "Replace the internal admin note on an order. The note is never shown to the customer.",
    input: { orderId: zId("Order"), adminNote: z.string().describe("Full replacement note text") },
    preview: (ctx, a) => svc.previewOrderNote(ctx.db, a.orderId, a.adminNote),
    execute: (ctx, a) => svc.setOrderNote(ctx.db, a.orderId, a.adminNote),
  }),

  writeTool({
    name: "orders_mark_delivered",
    title: "Mark order delivered",
    kind: "write",
    idempotent: true,
    description: "Set a SHIPPED or FULFILLED order to DELIVERED. Sends no email.",
    input: { orderId: zId("Order") },
    preview: (ctx, a) => svc.previewDeliver(ctx.db, a.orderId),
    execute: (ctx, a) => svc.markOrderDelivered(ctx.db, a.orderId),
  }),

  writeTool({
    name: "orders_fulfill",
    title: "Fulfill order (add tracking)",
    kind: "sensitive",
    openWorld: true,
    description:
      "Record a shipment for some or all line items with carrier and tracking number. When every item is fulfilled the order becomes SHIPPED (or FULFILLED without a tracking number) and an authorized-but-uncaptured card payment is CAPTURED via Stripe. Emails the customer a shipped notice when notifyCustomer is true. Check orders_get first so items aren't fulfilled twice.",
    input: {
      orderId: zId("Order"),
      trackingCompany: z.string().describe("Carrier, e.g. USPS or UPS"),
      trackingNumber: z.string().describe("Tracking number (empty string if not yet available)"),
      trackingUrl: z.string().nullish().describe("Optional tracking URL"),
      estimatedDelivery: z.string().nullish().describe("Optional estimated delivery date, YYYY-MM-DD"),
      notifyCustomer: z.boolean().describe("Email the customer a shipped notice"),
      items: z
        .array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1) }))
        .min(1)
        .describe("Line items in this shipment (ids from orders_get)"),
    },
    preview: (ctx, a) => svc.previewFulfill(ctx.db, a.orderId, a),
    execute: (ctx, { orderId, ...body }, x) => svc.fulfillOrder(ctx.db, orderId, body, { idempotencyKey: x.idempotencyKey }),
  }),

  writeTool({
    name: "orders_cancel",
    title: "Cancel order",
    kind: "sensitive",
    destructive: true,
    openWorld: true,
    description:
      "Cancel an order. If the payment was captured, the FULL amount is refunded via Stripe; if only authorized, the hold is released. Emails the customer a cancellation notice. The preview shows the exact payment action and email.",
    input: { orderId: zId("Order"), reason: z.string().describe("Cancellation reason (included in the customer email)") },
    preview: (ctx, a) => svc.previewCancel(ctx.db, a.orderId, a.reason),
    execute: (ctx, a, x) => svc.cancelOrder(ctx.db, a.orderId, a.reason, { idempotencyKey: x.idempotencyKey }),
  }),

  writeTool({
    name: "orders_refund",
    title: "Refund order",
    kind: "sensitive",
    destructive: true,
    openWorld: true,
    description:
      "Refund a paid order via Stripe, fully or partially, and email the customer a refund notice. The preview shows the exact amount, what was already refunded, and the resulting status. Check current status before retrying a refund.",
    input: {
      orderId: zId("Order"),
      amount: z.number().int().positive().nullish().describe("Partial refund in cents. Omit for a full refund of the remaining balance."),
      reason: z.string().nullish().describe("Reason (recorded in the admin note)"),
    },
    preview: (ctx, a) => svc.previewRefund(ctx.db, a.orderId, a),
    execute: (ctx, { orderId, ...body }, x) => svc.refundOrder(ctx.db, orderId, body, { idempotencyKey: x.idempotencyKey }),
  }),

  writeTool({
    name: "orders_resend_confirmation",
    title: "Resend order confirmation email",
    kind: "sensitive",
    openWorld: true,
    description: "Email the order confirmation to the customer again. The preview shows the recipient and how many confirmations were already sent.",
    input: { orderId: zId("Order") },
    preview: (ctx, a) => svc.previewResendConfirmation(ctx.db, a.orderId),
    execute: (ctx, a) => svc.resendOrderConfirmation(ctx.db, a.orderId),
  }),

  writeTool({
    name: "orders_check_tracking",
    title: "Check carrier tracking",
    kind: "write",
    idempotent: true,
    openWorld: true,
    description:
      "Query USPS/UPS for every SHIPPED order with a tracking number and set the ones the carrier reports delivered to DELIVERED. Sends no email.",
    input: {},
    preview: (ctx) => svc.previewCheckTracking(ctx.db),
    execute: (ctx) => svc.checkShippedTracking(ctx.db),
  }),
];
