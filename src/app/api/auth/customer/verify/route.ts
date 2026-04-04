import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCustomerSession } from "@/lib/customer-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/account/login?error=invalid", request.url));
  }

  const record = await prisma.magicLinkToken.findUnique({ where: { token } });

  if (!record || record.type !== "CUSTOMER") {
    return NextResponse.redirect(new URL("/account/login?error=invalid", request.url));
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/account/login?error=expired", request.url));
  }

  if (record.usedAt !== null) {
    return NextResponse.redirect(new URL("/account/login?error=used", request.url));
  }

  // Find or create customer
  let customer = await prisma.customer.findUnique({ where: { email: record.email } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { email: record.email },
    });
  }

  // Mark token as used
  await prisma.magicLinkToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  // Create session
  await createCustomerSession({
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
  });

  return NextResponse.redirect(new URL("/account", request.url));
}
