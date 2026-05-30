import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";

// Step 1: Redirect to Instagram OAuth
export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artisanId = request.nextUrl.searchParams.get("artisanId");
  if (!artisanId) return NextResponse.json({ error: "artisanId required" }, { status: 400 });

  const appId = process.env.INSTAGRAM_APP_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
  const redirectUri = `${siteUrl}/api/admin/instagram/callback`;

  if (!appId) {
    return NextResponse.json({ error: "INSTAGRAM_APP_ID not configured" }, { status: 500 });
  }

  const state = Buffer.from(JSON.stringify({ artisanId })).toString("base64");
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "instagram_basic,instagram_content_publish",
    response_type: "code",
    state,
  });

  return NextResponse.redirect(`https://api.instagram.com/oauth/authorize?${params}`);
}
