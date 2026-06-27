import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForHost } from "@/lib/tenant-context";

export async function GET(request: NextRequest) {
  try {
    const db = await getTenantPrismaForHost(request);
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("countryCode") || "US";
    // subtotal in cents, passed by checkout page
    const subtotal = parseInt(searchParams.get("subtotal") ?? "0", 10);

    // Find active shipping zones that include this country
    const zones = await db.shippingZone.findMany({
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

    const rates = zones.flatMap((zone) =>
      zone.rates.map((rate) => ({
        id: rate.id,
        name: rate.name,
        price: rate.price,
        condition: rate.condition,
        minValue: rate.minValue,
        maxValue: rate.maxValue,
        zoneName: zone.name,
      }))
    );

    // Deduplicate by id just in case
    const all = Array.from(new Map(rates.map((r) => [r.id, r])).values());

    // Filter by condition: only return rates the customer is eligible for
    const eligible = all.filter((rate) => {
      if (rate.condition === "ORDER_VALUE") {
        const meetsMin = rate.minValue === null || subtotal >= rate.minValue;
        const meetsMax = rate.maxValue === null || subtotal <= rate.maxValue;
        return meetsMin && meetsMax;
      }
      // FLAT, FREE, WEIGHT — always show
      return true;
    });

    return NextResponse.json(eligible);
  } catch (error) {
    console.error("shipping-rates error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
