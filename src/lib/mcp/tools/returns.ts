/**
 * Returns — mirrors /api/admin/returns/* via src/lib/admin-services/returns.ts.
 */
import { z } from "zod";
import { readTool, writeTool, zId, zPage, zLimit, type McpTool } from "../kit";
import * as svc from "@/lib/admin-services/returns";

const RETURN_STATUS = ["REQUESTED", "APPROVED", "REJECTED", "RECEIVED", "REFUNDED"] as const;

export const tools: McpTool[] = [
  readTool({
    name: "returns_list",
    title: "List returns",
    description:
      "List return requests newest first, optionally filtered by status. Returns each return with its status, refundAmount (cents), order (id, orderNumber, email, total in cents, customer) and items (title, variant, quantity).",
    input: {
      status: z.enum(RETURN_STATUS).nullish().describe("Return status filter"),
      page: zPage,
      limit: zLimit(100, 20),
    },
    run: (ctx, a) => svc.listReturns(ctx.db, a),
  }),

  readTool({
    name: "returns_get",
    title: "Get return",
    description:
      "Get one return with its order (status, payment status, total in cents, customer) and items (order line, price, variant). Use before approving, rejecting, receiving, or refunding.",
    input: { returnId: zId("Return") },
    run: (ctx, a) => svc.getReturn(ctx.db, a.returnId),
  }),

  writeTool({
    name: "returns_set_note",
    title: "Set return admin note",
    kind: "write",
    idempotent: true,
    description: "Replace the internal admin note on a return. Sends no email.",
    input: { returnId: zId("Return"), adminNote: z.string().describe("Full replacement note text") },
    preview: (ctx, a) => svc.previewReturnNote(ctx.db, a.returnId, a.adminNote),
    execute: (ctx, a) => svc.setReturnNote(ctx.db, a.returnId, a.adminNote),
  }),

  writeTool({
    name: "returns_approve",
    title: "Approve return",
    kind: "sensitive",
    openWorld: true,
    description:
      "Approve a REQUESTED return (status becomes APPROVED) and email the customer a return-approved notice. Moves no money.",
    input: { returnId: zId("Return") },
    preview: (ctx, a) => svc.previewApproveReturn(ctx.db, a.returnId),
    execute: (ctx, a) => svc.approveReturn(ctx.db, a.returnId),
  }),

  writeTool({
    name: "returns_reject",
    title: "Reject return",
    kind: "sensitive",
    destructive: true,
    openWorld: true,
    description:
      "Reject a REQUESTED or APPROVED return (status becomes REJECTED, resolved now) and email the customer the rejection with the reason. The reason replaces the return's existing admin note. Moves no money.",
    input: {
      returnId: zId("Return"),
      reason: z.string().min(1).describe("Rejection reason; included in the customer email and saved as the admin note"),
    },
    preview: (ctx, a) => svc.previewRejectReturn(ctx.db, a.returnId, a.reason),
    execute: (ctx, a) => svc.rejectReturn(ctx.db, a.returnId, a.reason),
  }),

  writeTool({
    name: "returns_receive",
    title: "Mark return received",
    kind: "sensitive",
    openWorld: true,
    description:
      "Mark an APPROVED return as RECEIVED and email the customer that the items arrived. Moves no money and does not restock inventory.",
    input: { returnId: zId("Return") },
    preview: (ctx, a) => svc.previewReceiveReturn(ctx.db, a.returnId),
    execute: (ctx, a) => svc.receiveReturn(ctx.db, a.returnId),
  }),

  writeTool({
    name: "returns_set_status",
    title: "Set return status (raw)",
    kind: "write",
    idempotent: true,
    description:
      "Overwrite a return's status field to any value with no transition checks. Sends no email, moves no money, and does not restock. Prefer returns_approve / returns_reject / returns_receive / returns_refund, which perform the real actions; setting REFUNDED here does NOT refund the customer.",
    input: {
      returnId: zId("Return"),
      status: z.enum(RETURN_STATUS).describe("New return status"),
    },
    preview: (ctx, a) => svc.previewSetReturnStatus(ctx.db, a.returnId, a.status),
    execute: (ctx, a) => svc.setReturnStatus(ctx.db, a.returnId, a.status),
  }),

  writeTool({
    name: "returns_refund",
    title: "Refund return",
    kind: "sensitive",
    destructive: true,
    openWorld: true,
    description:
      "Refund a return: issues a Stripe refund of exactly `amount` cents to the customer's card (if the order was paid via Stripe and amount > 0), marks the return REFUNDED, sets the order's payment status to REFUNDED (amount >= order total, order status also REFUNDED) or PARTIALLY_REFUNDED, optionally restocks the returned items, and emails the customer a refund notice. The preview shows the Stripe charge balance, status changes, inventory changes, and the email recipient. Check returns_get before retrying.",
    input: {
      returnId: zId("Return"),
      amount: z.number().int().min(0).describe("Refund amount in cents (0 = mark refunded without moving money); must not exceed the order total"),
      restock: z.boolean().describe("Add the returned quantities back to inventory"),
    },
    preview: (ctx, a) => svc.previewRefundReturn(ctx.db, a.returnId, { amount: a.amount, restock: a.restock }),
    execute: (ctx, a, x) =>
      svc.refundReturn(ctx.db, a.returnId, { amount: a.amount, restock: a.restock }, { idempotencyKey: x.idempotencyKey }),
  }),
];
