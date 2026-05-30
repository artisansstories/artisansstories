import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { artisanId } = await request.json() as { artisanId: string };
  await prisma.artisan.update({
    where: { id: artisanId },
    data: { igAccessToken: null, igUserId: null, igTokenExpiry: null },
  });
  return NextResponse.json({ ok: true });
}
