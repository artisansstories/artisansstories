import { NextResponse } from "next/server";
import { clearPlatformSession } from "@/lib/platform-session";

export async function GET() {
  await clearPlatformSession();
  return NextResponse.redirect(
    new URL("/platform/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  );
}

export async function POST() {
  await clearPlatformSession();
  return NextResponse.json({ success: true });
}
