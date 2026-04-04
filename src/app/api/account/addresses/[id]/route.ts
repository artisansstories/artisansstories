import { NextRequest, NextResponse } from 'next/server';
import { getAccountSession } from '@/lib/account-session';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAccountSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify the address belongs to this customer
    const existing = await prisma.address.findFirst({
      where: { id, customerId: session.customerId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
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

    // If setting as default, unset all others for this customer
    if (isDefault) {
      await prisma.address.updateMany({
        where: { customerId: session.customerId, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.update({
      where: { id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(company !== undefined && { company }),
        ...(address1 !== undefined && { address1 }),
        ...(address2 !== undefined && { address2 }),
        ...(city !== undefined && { city }),
        ...(state !== undefined && { state }),
        ...(stateCode !== undefined && { stateCode }),
        ...(zip !== undefined && { zip }),
        ...(country !== undefined && { country }),
        ...(countryCode !== undefined && { countryCode }),
        ...(phone !== undefined && { phone }),
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    return NextResponse.json({ address });
  } catch (err) {
    console.error('Address update error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAccountSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify the address belongs to this customer
    const existing = await prisma.address.findFirst({
      where: { id, customerId: session.customerId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    await prisma.address.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Address delete error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
