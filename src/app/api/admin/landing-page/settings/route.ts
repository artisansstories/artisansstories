import { NextResponse } from "next/server";
import { toResponse } from "@/lib/admin-services/http";
import { getLandingPageSettings, saveLandingPageSettings } from "@/lib/admin-services/landing-page";
import { resolveTenantFromAdminSession } from "@/lib/tenant-context";

export async function GET() {
  try {
    return toResponse(await getLandingPageSettings());
  } catch (error) {
    console.error("Failed to fetch landing page settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // The landing page is the house store's public page: the service refuses
    // (403) any other tenant. The tenant comes from the admin session only.
    const tenantId = await resolveTenantFromAdminSession();
    if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    return toResponse(await saveLandingPageSettings(tenantId, body));
  } catch (error) {
    console.error("[Landing Page Settings] Failed to save:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
