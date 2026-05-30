import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const error = searchParams.get("error");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";

  if (error || !code || !stateRaw) {
    return NextResponse.redirect(`${siteUrl}/admin/artisans?ig_error=${error ?? "missing_code"}`);
  }

  let artisanId: string;
  try {
    artisanId = JSON.parse(Buffer.from(stateRaw, "base64").toString()).artisanId;
  } catch {
    return NextResponse.redirect(`${siteUrl}/admin/artisans?ig_error=invalid_state`);
  }

  const appId = process.env.INSTAGRAM_APP_ID!;
  const appSecret = process.env.INSTAGRAM_APP_SECRET!;
  const redirectUri = `${siteUrl}/api/admin/instagram/callback`;

  try {
    // Exchange code for short-lived token
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; user_id?: number; error_message?: string };
    if (!tokenData.access_token) throw new Error(tokenData.error_message ?? "Token exchange failed");

    // Exchange for long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${tokenData.access_token}`
    );
    const longData = await longRes.json() as { access_token?: string; expires_in?: number };
    const longToken = longData.access_token ?? tokenData.access_token;
    const expiresIn = longData.expires_in ?? 5184000; // 60 days default

    const expiry = new Date(Date.now() + expiresIn * 1000);

    await prisma.artisan.update({
      where: { id: artisanId },
      data: {
        igAccessToken: longToken,
        igUserId: String(tokenData.user_id),
        igTokenExpiry: expiry,
      },
    });

    return NextResponse.redirect(`${siteUrl}/admin/artisans/${artisanId}/edit?ig_connected=1`);
  } catch (err) {
    console.error("[IG callback]", err);
    return NextResponse.redirect(`${siteUrl}/admin/artisans?ig_error=token_failed`);
  }
}
