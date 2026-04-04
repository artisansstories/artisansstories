import { NextResponse } from "next/server";
import { clearCustomerSession } from "@/lib/customer-auth";

export async function GET() {
  await clearCustomerSession();
  return NextResponse.redirect(
    new URL("/account/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
  );
}

export async function POST() {
  await clearCustomerSession();
  return NextResponse.json({ success: true });
}
