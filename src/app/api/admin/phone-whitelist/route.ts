import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireAdminSession } from "@/lib/admin-auth";

const prisma = new PrismaClient();

export async function GET() {
  await requireAdminSession();
  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
  });
  return NextResponse.json(admins);
}

export async function POST(req: NextRequest) {
  await requireAdminSession();
  const body = await req.json();
  const { name, phone, email, role } = body;

  if (!name || !phone) {
    return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
  }

  const digits = phone.replace(/\D/g, "");
  let normalized = phone;
  if (digits.length === 10) normalized = `+1${digits}`;
  else if (digits.length === 11 && digits[0] === "1") normalized = `+${digits}`;

  const admin = await prisma.adminUser.create({
    data: {
      name,
      phone: normalized,
      email: email || `${normalized}@placeholder.com`,
      role: role || "EDITOR",
    },
  });
  return NextResponse.json(admin, { status: 201 });
}
