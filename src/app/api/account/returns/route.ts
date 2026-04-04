import { NextRequest, NextResponse } from 'next/server';
import { getAccountSession } from '@/lib/account-session';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import { ReturnReason } from '@prisma/client';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  const session = await getAccountSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { orderId, items, customerNote } = body as {
      orderId: string;
      items: Array<{ orderItemId: string; quantity: number; reason: ReturnReason; note?: string }>;
      customerNote?: string;
    };

    if (!orderId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Verify order belongs to this customer
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId: session.customerId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Validate each item belongs to this order
    const orderItemIds = new Set(order.items.map(i => i.id));
    for (const item of items) {
      if (!orderItemIds.has(item.orderItemId)) {
        return NextResponse.json({ error: 'Invalid order item' }, { status: 400 });
      }
      if (item.quantity < 1) {
        return NextResponse.json({ error: 'Quantity must be at least 1' }, { status: 400 });
      }
    }

    const returnRequest = await prisma.return.create({
      data: {
        orderId,
        customerNote,
        items: {
          create: items.map(item => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
            reason: item.reason,
            note: item.note,
          })),
        },
      },
      include: {
        items: {
          include: { orderItem: true },
        },
      },
    });

    // Send notification email to admin
    const settings = await prisma.storeSettings.findUnique({ where: { id: 'singleton' } });
    const notifyEmail = settings?.orderNotificationEmail ?? settings?.contactEmail ?? process.env.RESEND_FROM ?? 'hello@artisansstories.com';
    const fromEmail = process.env.RESEND_FROM ?? 'hello@artisansstories.com';

    const itemsHtml = returnRequest.items
      .map(ri => `<li>${ri.quantity}x ${ri.orderItem.title} — ${ri.reason}${ri.note ? ` (${ri.note})` : ''}</li>`)
      .join('');

    await resend.emails.send({
      from: `Artisans Stories <${fromEmail}>`,
      to: [notifyEmail],
      subject: `New Return Request — Order ${order.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #3a2e24;">New Return Request</h2>
          <p><strong>Order:</strong> ${order.orderNumber}</p>
          <p><strong>Customer:</strong> ${session.email}</p>
          <p><strong>Return ID:</strong> ${returnRequest.id}</p>
          ${customerNote ? `<p><strong>Customer Note:</strong> ${customerNote}</p>` : ''}
          <h3 style="color: #3a2e24; margin-top: 20px;">Items to Return:</h3>
          <ul>${itemsHtml}</ul>
          <p style="margin-top: 20px; color: #7a6852; font-size: 13px;">
            Please review this return request in the admin panel.
          </p>
        </div>
      `,
    }).catch(err => console.error('Return notification email error:', err));

    return NextResponse.json({ return: returnRequest }, { status: 201 });
  } catch (err) {
    console.error('Return creation error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
