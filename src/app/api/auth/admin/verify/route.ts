import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminSession } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/admin/login?error=invalid", request.url));
  }

  // Look up token
  const record = await prisma.magicLinkToken.findUnique({
    where: { token },
  });

  if (!record || record.type !== "ADMIN") {
    return NextResponse.redirect(new URL("/admin/login?error=invalid", request.url));
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/admin/login?error=expired", request.url));
  }

  if (record.usedAt !== null) {
    return NextResponse.redirect(new URL("/admin/login?error=used", request.url));
  }

  // Find admin user
  const adminUser = await prisma.adminUser.findUnique({
    where: { email: record.email },
  });

  if (!adminUser || !adminUser.isActive) {
    return NextResponse.redirect(new URL("/admin/login?error=invalid", request.url));
  }

  // Mark token as used
  await prisma.magicLinkToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  // Create session
  await createAdminSession({
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: adminUser.role,
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
