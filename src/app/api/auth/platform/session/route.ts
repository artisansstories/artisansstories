import { NextResponse } from "next/server";
import { getPlatformSession } from "@/lib/platform-session";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) {
    return NextResponse.json({ session: null }, { status: 401 });
  }
  return NextResponse.json({ session });
}
