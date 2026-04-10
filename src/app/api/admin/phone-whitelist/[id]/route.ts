import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireAdminSession } from "@/lib/admin-auth";

const prisma = new PrismaClient();

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdminSession();
  const { id } = await params;
  const body = await req.json();
  const { name, phone, email, role, isActive } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (role !== undefined) data.role = role;
  if (isActive !== undefined) data.isActive = isActive;
  if (phone !== undefined) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) data.phone = `+1${digits}`;
    else if (digits.length === 11 && digits[0] === "1") data.phone = `+${digits}`;
    else data.phone = phone;
  }

  const admin = await prisma.adminUser.update({ where: { id }, data });
  return NextResponse.json(admin);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdminSession();
  const { id } = await params;
  await prisma.adminUser.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
