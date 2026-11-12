import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { IG_STATE_COOKIE, encodeIgState } from "@/lib/instagram-oauth";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

// Step 1: Redirect to Instagram OAuth
export async function GET(request: NextRequest) {
  try {
    await requireHouseAdminTenantId();
  } catch (err) {
    const denied = authErrorResponse(err);
    if (denied) return denied;
    throw err;
  }

  const artisanId = request.nextUrl.searchParams.get("artisanId");
  if (!artisanId) return NextResponse.json({ error: "artisanId required" }, { status: 400 });

  const appId = process.env.INSTAGRAM_APP_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
  const redirectUri = `${siteUrl}/api/admin/instagram/callback`;

  if (!appId) {
    return NextResponse.json({ error: "INSTAGRAM_APP_ID not configured" }, { status: 500 });
  }

  // The state carries a one-time nonce that must match an httpOnly cookie set
  // here, so a callback URL crafted by someone else can't attach their
  // Instagram account to an artisan (OAuth CSRF).
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = encodeIgState({ artisanId, nonce });
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "instagram_basic,instagram_content_publish",
    response_type: "code",
    state,
  });

  const res = NextResponse.redirect(`https://api.instagram.com/oauth/authorize?${params}`);
  res.cookies.set(IG_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on Instagram's top-level redirect back to the callback
    path: "/api/admin/instagram",
    maxAge: 10 * 60,
  });
  return res;
}
