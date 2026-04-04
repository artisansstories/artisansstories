import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const ret = await prisma.return.findUnique({ where: { id } });
    if (!ret) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    if (ret.status !== "APPROVED") {
      return NextResponse.json({ error: "Return must be APPROVED before marking as received" }, { status: 400 });
    }
    const updated = await prisma.return.update({
      where: { id },
      data: { status: "RECEIVED" },
    });
    return NextResponse.json({ return: updated });
  } catch (err) {
    console.error("POST /api/admin/returns/[id]/receive error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
