import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPlatformSession } from "@/lib/platform-session";
import { safePlatformCallback } from "@/lib/safe-callback";

export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
  const token = request.nextUrl.searchParams.get("token");
  // Honor callbackUrl through the whole flow (this is the admin-side bug we
  // already fixed — do not drop it here).
  const callbackUrl = safePlatformCallback(request.nextUrl.searchParams.get("callbackUrl"));

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/platform/login?error=invalid`);
  }

  const record = await prisma.platformOperatorToken.findUnique({ where: { token } });

  if (!record) {
    return NextResponse.redirect(`${siteUrl}/platform/login?error=invalid`);
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.redirect(`${siteUrl}/platform/login?error=expired`);
  }

  if (record.usedAt !== null) {
    return NextResponse.redirect(`${siteUrl}/platform/login?error=used`);
  }

  // Resolve the operator the token was issued for; must still be active.
  const operator = await prisma.platformOperator.findUnique({
    where: { email: record.email },
  });
  if (!operator || !operator.isActive) {
    return NextResponse.redirect(`${siteUrl}/platform/login?error=unauthorized`);
  }

  // Mark token used (single-use).
  await prisma.platformOperatorToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  // Record the login.
  await prisma.platformOperator.update({
    where: { id: operator.id },
    data: { lastLoginAt: new Date() },
  });

  await createPlatformSession({
    id: operator.id,
    email: operator.email,
    name: operator.name,
  });

  return NextResponse.redirect(`${siteUrl}${callbackUrl}`);
}
