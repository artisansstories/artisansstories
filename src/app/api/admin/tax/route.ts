import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Tax settings are stored as a JSON string in StoreSettings.facebookPixelId
// using the prefix "TAX:" to distinguish from real pixel IDs.
// Note: This is a pragmatic workaround until the schema can be updated with
// dedicated tax fields.

const TAX_PREFIX = "TAX:";
const DEFAULT_TAX = { stripeTaxEnabled: false, defaultTaxRate: 8.25, nexusStates: ["CA"] };

async function readTaxSettings() {
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "singleton" } });
    if (settings?.facebookPixelId?.startsWith(TAX_PREFIX)) {
      return JSON.parse(settings.facebookPixelId.slice(TAX_PREFIX.length));
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_TAX };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const taxSettings = await readTaxSettings();
    return NextResponse.json(taxSettings);
  } catch (err) {
    console.error("GET /api/admin/tax error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { stripeTaxEnabled, defaultTaxRate, nexusStates } = body;

    const taxSettings = {
      stripeTaxEnabled: Boolean(stripeTaxEnabled),
      defaultTaxRate: Number(defaultTaxRate) || 0,
      nexusStates: Array.isArray(nexusStates) ? nexusStates : [],
    };

    await prisma.storeSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        facebookPixelId: TAX_PREFIX + JSON.stringify(taxSettings),
      },
      update: {
        facebookPixelId: TAX_PREFIX + JSON.stringify(taxSettings),
      },
    });

    return NextResponse.json(taxSettings);
  } catch (err) {
    console.error("PUT /api/admin/tax error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
