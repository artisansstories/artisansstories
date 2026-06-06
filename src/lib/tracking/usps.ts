/**
 * USPS Tracking API
 * Register at: https://registration.shippingapis.com/
 * Set env var: USPS_USER_ID
 */

export interface TrackingResult {
  trackingNumber: string;
  status: "delivered" | "in_transit" | "out_for_delivery" | "exception" | "unknown";
  description: string;
  deliveredAt?: Date;
}

export async function checkUSPS(trackingNumber: string): Promise<TrackingResult> {
  const userId = process.env.USPS_USER_ID;
  if (!userId) {
    return { trackingNumber, status: "unknown", description: "USPS_USER_ID not configured" };
  }

  const xml = `<TrackFieldRequest USERID="${userId}"><TrackID ID="${trackingNumber}"></TrackID></TrackFieldRequest>`;
  const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=${encodeURIComponent(xml)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();

    // Parse delivery status from XML response
    // Extract latest event description (simplified parse)
    const eventTimeMatch = text.match(/<EventTime>(.*?)<\/EventTime>/);
    const eventDescMatch = text.match(/<Event>(.*?)<\/Event>/);    const eventMatch: [string, string, string] | null = eventTimeMatch && eventDescMatch
      ? [text, eventTimeMatch[1], eventDescMatch[1]] as [string, string, string]
      : null;
    const statusEvent = eventMatch?.[2]?.toLowerCase() ?? "";

    if (text.includes("<Error>")) {
      const errMsg = text.match(/<Description>(.*?)<\/Description>/)?.[1] ?? "Unknown error";
      return { trackingNumber, status: "unknown", description: `USPS error: ${errMsg}` };
    }

    if (statusEvent.includes("delivered")) {
      // Try to parse delivered date
      const dateMatch = text.match(/<EventDate>(.*?)<\/EventDate>/);
      const timeMatch = text.match(/<EventTime>(.*?)<\/EventTime>/);
      const deliveredAt = dateMatch ? new Date(`${dateMatch[1]} ${timeMatch?.[1] ?? ""}`) : new Date();
      return {
        trackingNumber,
        status: "delivered",
        description: eventMatch?.[2] ?? "Delivered",
        deliveredAt: isNaN(deliveredAt.getTime()) ? new Date() : deliveredAt,
      };
    }

    if (statusEvent.includes("out for delivery")) {
      return { trackingNumber, status: "out_for_delivery", description: eventMatch?.[2] ?? "Out for delivery" };
    }

    if (statusEvent.includes("exception") || statusEvent.includes("alert")) {
      return { trackingNumber, status: "exception", description: eventMatch?.[2] ?? "Exception" };
    }

    return {
      trackingNumber,
      status: "in_transit",
      description: eventMatch?.[2] ?? "In transit",
    };
  } catch (err) {
    console.error(`USPS tracking error for ${trackingNumber}:`, err);
    return { trackingNumber, status: "unknown", description: "Network error checking USPS" };
  }
}
