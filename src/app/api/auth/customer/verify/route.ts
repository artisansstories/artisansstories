import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken, createSessionToken } from '@/lib/customer-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/account/login?error=invalid', request.url));
  }

  const payload = await verifyMagicToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL('/account/login?error=invalid', request.url));
  }

  const { email } = payload;

  // Find or create customer
  let customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        email,
        createdAt: new Date(),
      },
    });
  }

  const sessionToken = await createSessionToken(customer.id, customer.email);

  const thirtyDays = 60 * 60 * 24 * 30;

  const response = NextResponse.redirect(new URL('/account', request.url));
  response.cookies.set('customer_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: thirtyDays,
    path: '/',
  });

  return response;
}
