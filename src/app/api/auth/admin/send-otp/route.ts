import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import twilio from "twilio";

const prisma = new PrismaClient();

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const phone = normalizePhone(body.phone ?? "");

  if (!phone) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  // Rate limit: max 3 OTPs per phone per 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentCount = await prisma.adminOtpToken.count({
    where: { phone, createdAt: { gte: fiveMinAgo } },
  });
  if (recentCount >= 3) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Look up admin — silently succeed if not found (no enumeration)
  const admin = await prisma.adminUser.findUnique({ where: { phone } });
  if (!admin || !admin.isActive) {
    return NextResponse.json({ success: true });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.adminOtpToken.create({ data: { phone, code, expiresAt } });

  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );
  await twilioClient.messages.create({
    body: `Your Artisans Stories admin code: ${code}. Valid for 10 minutes.`,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: phone,
  });

  return NextResponse.json({ success: true });
}
