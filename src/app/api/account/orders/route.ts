import { NextResponse } from 'next/server';
import { getAccountSession } from '@/lib/account-session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getAccountSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orders = await prisma.order.findMany({
      where: { customerId: session.customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: {
              select: {
                images: {
                  where: { isDefault: true },
                  take: 1,
                  select: { url: true, urlThumb: true, altText: true },
                },
              },
            },
          },
        },
        fulfillments: {
          select: {
            id: true,
            status: true,
            trackingCompany: true,
            trackingNumber: true,
            trackingUrl: true,
            shippedAt: true,
            estimatedDelivery: true,
          },
        },
      },
    });

    return NextResponse.json({ orders });
  } catch (err) {
    console.error('Orders fetch error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
