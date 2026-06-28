import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { Resend } from "resend";
import { orderConfirmationHtml } from "@/lib/emails/order-confirmation";
import { getEmailBranding } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
const resend = new Resend(process.env.RESEND_API_KEY);
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getTenantPrismaForAdmin();
    const { id } = await params;
    const order = await db.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
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
    await logEmail({ tenantId: db.$tenantId, type: "ORDER_CONFIRMATION", toEmail: order.email, fromEmail: branding.fromAddress, subject: `Order Confirmed — ${order.orderNumber}`, bodyHtml: confirmHtml, resendId: resendResult.data?.id, relatedId: order.id, relatedType: "ORDER" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/resend-email error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
