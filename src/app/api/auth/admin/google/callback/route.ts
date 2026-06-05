import { NextRequest, NextResponse } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";

const ALLOWED_EMAILS = ["anna@artisansstories.com", "wayne@greenbowtie.com"];

export async function GET(req: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${siteUrl}/admin/login?error=misconfigured`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${siteUrl}/admin/login?error=cancelled`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${siteUrl}/api/auth/admin/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(`${siteUrl}/admin/login?error=token_failed`);
    }

    const tokens = await tokenRes.json();

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${siteUrl}/admin/login?error=userinfo_failed`);
    }

    const user = await userRes.json();
    const email = user.email?.toLowerCase();

    // Enforce allowlist
    if (!email || !ALLOWED_EMAILS.includes(email)) {
      return NextResponse.redirect(`${siteUrl}/admin/login?error=unauthorized`);
    }

    // Create admin session
    await createAdminSession({
      id: email,
      email,
      name: user.name ?? email,
      role: "SUPER_ADMIN",
    });

    return NextResponse.redirect(`${siteUrl}/admin`);
  } catch (err) {
    console.error("Google SSO callback error:", err);
    return NextResponse.redirect(`${siteUrl}/admin/login?error=server_error`);
  }
}
