import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-prisma";
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

  // The magic-link token carries the tenant it was issued for; scope all
  // customer reads/writes to that tenant.
  const db = getTenantPrisma(record.tenantId);

  // Find or create customer
  let customer = await db.customer.findFirst({ where: { email: record.email } });
  if (!customer) {
    customer = await db.customer.create({
      data: { email: record.email, tenantId: db.$tenantId },
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

  // Support redirect param for deep-linking (e.g. straight to order page from confirmation email)
  const redirectTo = searchParams.get("redirect");
  const safePath = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/account";
  return NextResponse.redirect(new URL(safePath, request.url));
}
