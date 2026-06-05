import { NextResponse } from "next/server";

const ALLOWED_EMAILS = ["anna@artisansstories.com", "wayne@greenbowtie.com"];

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";

  if (!clientId) {
    return NextResponse.json({ error: "Google SSO not configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${siteUrl}/api/auth/admin/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    hd: "", // allow any domain (we enforce allowlist ourselves)
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}

export { ALLOWED_EMAILS };
