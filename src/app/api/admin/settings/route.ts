import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();

    const settings = await db.storeSettings.findUnique({ where: { id: "singleton" } });
    if (!settings) {
      // Create default if missing
      const created = await db.storeSettings.create({ data: { id: "singleton", tenantId: db.$tenantId } });
      return NextResponse.json(created);
    }
    return NextResponse.json(settings);
  } catch (error) {
    console.error("GET /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
export async function PUT(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const body = await request.json();
    // Remove read-only fields
    delete body.id;
    delete body.createdAt;
    delete body.updatedAt;
    const settings = await db.storeSettings.upsert({
      where: { id: "singleton" },
      update: body,
      create: { id: "singleton", ...body },
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error("PUT /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
