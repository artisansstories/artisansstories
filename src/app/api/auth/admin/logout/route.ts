import { NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/admin-auth";

export async function GET() {
  await clearAdminSession();
  return NextResponse.redirect(
    new URL("/admin/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
  );
}

export async function POST() {
  await clearAdminSession();
  return NextResponse.json({ success: true });
}
