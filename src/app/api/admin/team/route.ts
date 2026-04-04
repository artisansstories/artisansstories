import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const admins = await prisma.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ admins });
  } catch (err) {
    console.error("GET /api/admin/team error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json() as { name: string; email: string; role: string };
    const { name, email, role } = body;

    if (!name || !email || !role) {
      return NextResponse.json({ error: "Name, email, and role are required" }, { status: 400 });
    }

    if (!["ADMIN", "EDITOR"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "An admin with this email already exists" }, { status: 409 });
    }

    const newAdmin = await prisma.adminUser.create({
      data: {
        name,
        email: normalizedEmail,
        role: role as "ADMIN" | "EDITOR",
        isActive: true,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    // Send invite magic link email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
    await fetch(`${siteUrl}/api/auth/admin/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        isInvite: true,
        inviterName: session.name,
        role,
      }),
    });

    return NextResponse.json({ admin: newAdmin }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/team error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
