import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminSession } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/admin/login?error=invalid`);
  }

  const record = await prisma.magicLinkToken.findUnique({ where: { token } });

  if (!record || record.type !== "ADMIN") {
    return NextResponse.redirect(`${siteUrl}/admin/login?error=invalid`);
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.redirect(`${siteUrl}/admin/login?error=expired`);
  }

  if (record.usedAt !== null) {
    return NextResponse.redirect(`${siteUrl}/admin/login?error=used`);
  }

  // Verify still active in DB
  const adminUser = await prisma.adminUser.findUnique({ where: { email: record.email } });
  if (!adminUser || !adminUser.isActive) {
    return NextResponse.redirect(`${siteUrl}/admin/login?error=unauthorized`);
  }

  // Mark token used
  await prisma.magicLinkToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  await createAdminSession({
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: adminUser.role,
  });

  return NextResponse.redirect(`${siteUrl}/admin`);
}
