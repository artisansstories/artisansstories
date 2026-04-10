import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { createAdminSession } from "@/lib/admin-auth";
import { timingSafeEqual } from "crypto";

const prisma = new PrismaClient();

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

function safeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a.padEnd(6, " "));
    const bufB = Buffer.from(b.padEnd(6, " "));
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const phone = normalizePhone(body.phone ?? "");
  const code = String(body.code ?? "").trim();

  if (!phone || !code) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const token = await prisma.adminOtpToken.findFirst({
    where: {
      phone,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!token || !safeEqual(token.code, code)) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  await prisma.adminOtpToken.update({
    where: { id: token.id },
    data: { usedAt: new Date() },
  });

  const admin = await prisma.adminUser.findUnique({ where: { phone } });
  if (!admin || !admin.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await createAdminSession({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });

  return NextResponse.json({ success: true });
}
