import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() {
  try {
    
    
    const settings = await prisma.storeSettings.findUnique({ where: { id: "singleton" } });
    if (!settings) {
      // Create default if missing
      const created = await prisma.storeSettings.create({ data: { id: "singleton" } });
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
    
    
    const body = await request.json();
    // Remove read-only fields
    delete body.id;
    delete body.createdAt;
    delete body.updatedAt;
    const settings = await prisma.storeSettings.upsert({
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
