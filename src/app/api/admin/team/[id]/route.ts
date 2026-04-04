import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json() as { role?: string; isActive?: boolean };
    const { role, isActive } = body;

    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    // Cannot change SUPER_ADMIN role via UI
    if (role !== undefined && target.role === "SUPER_ADMIN") {
      return NextResponse.json({ error: "Cannot change SUPER_ADMIN role" }, { status: 403 });
    }

    if (role !== undefined && !["ADMIN", "EDITOR"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data: {
        ...(role !== undefined && { role: role as "ADMIN" | "EDITOR" }),
        ...(isActive !== undefined && { isActive }),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ admin: updated });
  } catch (err) {
    console.error("PUT /api/admin/team/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden — only SUPER_ADMIN can remove admins" }, { status: 403 });
    }

    const { id } = await params;

    if (session.id === id) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    }

    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    await prisma.adminUser.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/team/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
