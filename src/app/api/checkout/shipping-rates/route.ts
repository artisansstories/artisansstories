import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("countryCode") || "US";

    // Find active shipping zones that include this country
    const zones = await prisma.shippingZone.findMany({
      where: {
        isActive: true,
        countries: { has: countryCode },
      },
      include: {
        rates: {
          where: { isActive: true },
          orderBy: { price: "asc" },
        },
      },
    });

    // If no zone found for country, fall back to zones with no country restrictions
    // or return empty array
    const rates = zones.flatMap((zone) =>
      zone.rates.map((rate) => ({
        id: rate.id,
        name: rate.name,
        price: rate.price,
        condition: rate.condition,
        zoneName: zone.name,
      }))
    );

    // Deduplicate by id just in case
    const unique = Array.from(new Map(rates.map((r) => [r.id, r])).values());

    return NextResponse.json(unique);
  } catch (error) {
    console.error("shipping-rates error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
