import { NextRequest, NextResponse } from "next/server";
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
