import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "crypto";
import { createAdminSession } from "@/lib/admin-auth";

// In-memory rate limiter: IP -> { count, resetAt }
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= MAX_ATTEMPTS) return true;
  entry.count++;
  return false;
}

export async function POST(req: NextRequest) {
  const ip = getIp(req);

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { password } = await req.json().catch(() => ({ password: "" }));

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const a = Buffer.from(createHash("sha256").update(password ?? "").digest());
  const b = Buffer.from(createHash("sha256").update(adminPassword).digest());

  if (!timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // Clear rate limit on success
  attempts.delete(ip);

  await createAdminSession({ id: "admin", email: "admin", name: "Admin", role: "SUPER_ADMIN" });
  return NextResponse.json({ success: true });
}
