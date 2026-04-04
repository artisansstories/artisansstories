import { NextRequest, NextResponse } from 'next/server';
import { getAccountSession } from '@/lib/account-session';
import { prisma } from '@/lib/prisma';
import { AddressType } from '@prisma/client';

export async function GET() {
  const session = await getAccountSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const addresses = await prisma.address.findMany({
      where: { customerId: session.customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ addresses });
  } catch (err) {
    console.error('Address list error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAccountSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      type,
      firstName,
      lastName,
      company,
      address1,
      address2,
      city,
      state,
      stateCode,
      zip,
      country,
      countryCode,
      phone,
      isDefault,
    } = body;

    if (!firstName || !lastName || !address1 || !city || !state || !stateCode || !zip) {
      return NextResponse.json({ error: 'Required fields missing' }, { status: 400 });
    }

    // If setting as default, unset all others
    if (isDefault) {
      await prisma.address.updateMany({
        where: { customerId: session.customerId },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        customerId: session.customerId,
        type: (type as AddressType) ?? AddressType.SHIPPING,
        firstName,
        lastName,
        company,
        address1,
        address2,
        city,
        state,
        stateCode,
        zip,
        country: country ?? 'United States',
        countryCode: countryCode ?? 'US',
        phone,
        isDefault: isDefault ?? false,
        createdAt: new Date(),
      },
    });

    return NextResponse.json({ address }, { status: 201 });
  } catch (err) {
    console.error('Address create error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
