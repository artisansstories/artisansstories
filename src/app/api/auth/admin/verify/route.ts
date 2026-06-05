import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminSession } from "@/lib/admin-auth";

const ALLOWED_EMAILS = [
  "anna@artisansstories.com",
  "wayne@artisansstories.com",
  "wayne@greenbowtie.com",
];

const NAME_MAP: Record<string, string> = {
  "anna@artisansstories.com": "Anna Kool",
  "wayne@artisansstories.com": "Wayne Kool",
  "wayne@greenbowtie.com": "Wayne Kool",
};

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

  if (!ALLOWED_EMAILS.includes(record.email)) {
    return NextResponse.redirect(`${siteUrl}/admin/login?error=unauthorized`);
  }

  // Mark token used
  await prisma.magicLinkToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  await createAdminSession({
    id: record.email,
    email: record.email,
    name: NAME_MAP[record.email] ?? record.email,
    role: "SUPER_ADMIN",
  });

  return NextResponse.redirect(`${siteUrl}/admin`);
}
