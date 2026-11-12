import { NextResponse } from "next/server";
import { toResponse } from "@/lib/admin-services/http";
import { getLandingPageSettings, saveLandingPageSettings } from "@/lib/admin-services/landing-page";

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
    const body = await req.json();
    return toResponse(await saveLandingPageSettings(body));
  } catch (error) {
    console.error("[Landing Page Settings] Failed to save:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
