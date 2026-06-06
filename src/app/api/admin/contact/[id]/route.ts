import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as { status?: string; notes?: string };

    const message = await prisma.contactMessage.update({
      where: { id },
      data: {
        ...(body.status !== undefined && { status: body.status as "UNREAD" | "READ" | "REPLIED" | "ARCHIVED" }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    return NextResponse.json({ message });
  } catch (error) {
    console.error("PATCH /api/admin/contact/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
