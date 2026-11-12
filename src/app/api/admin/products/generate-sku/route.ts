import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { generateSku, type GenerateSkuBody } from "@/lib/admin-services/products";
import { toResponse } from "@/lib/admin-services/http";

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getTenantPrismaForAdmin();

  const body = await req.json() as GenerateSkuBody;
  return toResponse(await generateSku(db, body));
}
