import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { requireAdminSession } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getTenantPrismaForAdmin();
  const { artisanId } = await request.json() as { artisanId: string };
  await db.artisan.update({
    where: { id: artisanId },
    data: { igAccessToken: null, igUserId: null, igTokenExpiry: null },
  });
  return NextResponse.json({ ok: true });
}
