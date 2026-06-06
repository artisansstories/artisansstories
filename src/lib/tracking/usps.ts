/**
 * USPS Tracking API (new OAuth2 platform, effective Jan 2026)
 * Register at: https://cop.usps.com (USPS Customer Onboarding Portal)
 * Steps: Create USPS Business Account → Create App → get Consumer Key + Secret
 * Set env vars: USPS_CLIENT_ID, USPS_CLIENT_SECRET
 *
 * Docs: https://developers.usps.com/api/81 (OAuth)
 *       https://developers.usps.com/apis (Tracking API)
 */

export interface TrackingResult {
  trackingNumber: string;
  status: "delivered" | "in_transit" | "out_for_delivery" | "exception" | "unknown";
  description: string;
  deliveredAt?: Date;
}

let uspsTokenCache: { token: string; expiresAt: number } | null = null;

async function getUSPSToken(): Promise<string | null> {
  if (uspsTokenCache && Date.now() < uspsTokenCache.expiresAt) {
    return uspsTokenCache.token;
  }

  const clientId = process.env.USPS_CLIENT_ID;
  const clientSecret = process.env.USPS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://apis.usps.com/oauth2/v3/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    uspsTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
    };
    return uspsTokenCache.token;
  } catch (err) {
    console.error("USPS OAuth error:", err);
    return null;
  }
}

export async function checkUSPS(trackingNumber: string): Promise<TrackingResult> {
  if (!process.env.USPS_CLIENT_ID) {
    return { trackingNumber, status: "unknown", description: "USPS_CLIENT_ID not configured — register at cop.usps.com" };
  }

  const token = await getUSPSToken();
  if (!token) {
    return { trackingNumber, status: "unknown", description: "Failed to get USPS auth token" };
  }

  try {
    const res = await fetch(
      `https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(trackingNumber)}?expand=SUMMARY`,
      {
        headers: { "Authorization": `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { trackingNumber, status: "unknown", description: `USPS API error ${res.status}: ${errText.slice(0, 100)}` };
    }

    const data = await res.json() as {
      trackSummary?: {
        eventType?: string;
        eventDescription?: string;
        eventDate?: string;
        eventTime?: string;
      };
      error?: { message?: string };
    };

    if (data.error) {
      return { trackingNumber, status: "unknown", description: data.error.message ?? "USPS error" };
    }

    const eventType = (data.trackSummary?.eventType ?? "").toUpperCase();
    const description = data.trackSummary?.eventDescription ?? "Unknown";

    // USPS event types: DELIVERED, OUT_FOR_DELIVERY, IN_TRANSIT, ALERT, etc.
    if (eventType === "DELIVERED" || description.toUpperCase().includes("DELIVERED")) {
      const dateStr = data.trackSummary?.eventDate;
      const timeStr = data.trackSummary?.eventTime;
      const deliveredAt = dateStr ? new Date(`${dateStr}T${timeStr ?? "12:00:00"}`) : new Date();
      return {
        trackingNumber,
        status: "delivered",
        description,
        deliveredAt: isNaN(deliveredAt.getTime()) ? new Date() : deliveredAt,
      };
    }

    if (eventType === "OUT_FOR_DELIVERY" || description.toUpperCase().includes("OUT FOR DELIVERY")) {
      return { trackingNumber, status: "out_for_delivery", description };
    }

    if (eventType === "ALERT" || eventType.includes("EXCEPTION")) {
      return { trackingNumber, status: "exception", description };
    }

    return { trackingNumber, status: "in_transit", description };
  } catch (err) {
    console.error(`USPS tracking error for ${trackingNumber}:`, err);
    return { trackingNumber, status: "unknown", description: "Network error checking USPS" };
  }
}
