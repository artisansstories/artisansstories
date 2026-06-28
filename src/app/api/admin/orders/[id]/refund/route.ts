import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import Stripe from "stripe";
import { Resend } from "resend";
import { getEmailBranding, emailLogoHtml } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";

const resend = new Resend(process.env.RESEND_API_KEY);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-01-27.acacia",
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json() as { amount?: number; reason?: string };

    const order = await db.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (!["PAID", "PARTIALLY_REFUNDED"].includes(order.financialStatus)) {
      const hint = order.financialStatus === "AUTHORIZED"
        ? "Payment is authorized but not yet captured. Cancel the order to release the hold with no fees."
        : "Order is not in a refundable state";
      return NextResponse.json({ error: hint }, { status: 400 });
    }

    if (!order.stripePaymentIntentId) {
      return NextResponse.json({ error: "No Stripe payment found for this order" }, { status: 400 });
    }

    // Get the charge from the PaymentIntent
    const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    const chargeId = pi.latest_charge as string;
    if (!chargeId) {
      return NextResponse.json({ error: "No charge found on this payment" }, { status: 400 });
    }

    // Refund amount: partial if specified, full if not
    const refundAmount = body.amount && body.amount > 0 ? body.amount : undefined;

    const refund = await stripe.refunds.create({
      charge: chargeId,
      ...(refundAmount ? { amount: refundAmount } : {}),
      reason: "requested_by_customer",
    });

    // Determine new financial status
    const isFullRefund = !refundAmount || refundAmount >= order.total;
    const newFinancialStatus = isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED";
    const newStatus = isFullRefund ? "REFUNDED" : order.status;

    await db.order.update({
      where: { id },
      data: {
        financialStatus: newFinancialStatus,
        status: newStatus,
        updatedAt: new Date(),
        adminNote: order.adminNote
          ? `${order.adminNote}\n\nRefund issued: ${body.reason ?? "Admin initiated"} (${new Date().toLocaleDateString()})`
          : `Refund issued: ${body.reason ?? "Admin initiated"} (${new Date().toLocaleDateString()})`,
      },
    });

    // Send refund notification email
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
      await logEmail({ tenantId: db.$tenantId, type: "ORDER_REFUNDED", toEmail: order.email, fromEmail: branding.fromAddress, subject: `Refund issued for order ${order.orderNumber}`, bodyHtml: html, resendId: emailResult.data?.id, relatedId: order.id, relatedType: "ORDER" });
    } catch (emailErr) {
      console.error("Failed to send refund email:", emailErr);
    }

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amount: refund.amount,
      status: refund.status,
    });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/refund error:", err);
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
