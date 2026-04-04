import { NextRequest, NextResponse } from 'next/server';
import { getAccountSession } from '@/lib/account-session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getAccountSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: session.customerId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        acceptsMarketing: true,
        totalOrders: true,
        totalSpent: true,
        createdAt: true,
        lastOrderAt: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ customer });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAccountSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { firstName, lastName, phone, acceptsMarketing } = body;

    const customer = await prisma.customer.update({
      where: { id: session.customerId },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(acceptsMarketing !== undefined && { acceptsMarketing }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        acceptsMarketing: true,
        totalOrders: true,
        totalSpent: true,
      },
    });

    return NextResponse.json({ customer });
  } catch (err) {
    console.error('Profile update error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
