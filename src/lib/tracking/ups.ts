/**
 * UPS Tracking API (OAuth 2.0)
 * Register at: https://developer.ups.com
 * Set env vars: UPS_CLIENT_ID, UPS_CLIENT_SECRET
 */

import type { TrackingResult } from "./usps";

let upsTokenCache: { token: string; expiresAt: number } | null = null;

async function getUPSToken(): Promise<string | null> {
  if (upsTokenCache && Date.now() < upsTokenCache.expiresAt) {
    return upsTokenCache.token;
  }

  const clientId = process.env.UPS_CLIENT_ID;
  const clientSecret = process.env.UPS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    upsTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
    };
    return upsTokenCache.token;
  } catch (err) {
    console.error("UPS OAuth error:", err);
    return null;
  }
}

export async function checkUPS(trackingNumber: string): Promise<TrackingResult> {
  if (!process.env.UPS_CLIENT_ID) {
    return { trackingNumber, status: "unknown", description: "UPS_CLIENT_ID not configured" };
  }

  const token = await getUPSToken();
  if (!token) {
    return { trackingNumber, status: "unknown", description: "Failed to get UPS auth token" };
  }

  try {
    const res = await fetch(
      `https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(trackingNumber)}?locale=en_US&returnSignature=false`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "transId": `artisans-${Date.now()}`,
          "transactionSrc": "artisansstories",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      return { trackingNumber, status: "unknown", description: `UPS API error: ${res.status}` };
    }

    const data = await res.json() as {
      trackResponse?: {
        shipment?: Array<{
          package?: Array<{
            activity?: Array<{
              status?: { type?: string; description?: string; code?: string };
              date?: string;
              time?: string;
            }>;
          }>;
        }>;
      };
    };

    const activity = data?.trackResponse?.shipment?.[0]?.package?.[0]?.activity ?? [];
    if (activity.length === 0) {
      return { trackingNumber, status: "in_transit", description: "No tracking events yet" };
    }

    const latest = activity[0];
    const statusType = latest?.status?.type?.toUpperCase() ?? "";
    const statusCode = latest?.status?.code ?? "";
    const description = latest?.status?.description ?? "Unknown";

    // UPS status types: D=Delivered, I=In Transit, O=Out for Delivery, X=Exception
    if (statusType === "D" || statusCode === "KB" || description.toLowerCase().includes("delivered")) {
      const deliveredAt = latest.date && latest.time
        ? new Date(`${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}T${latest.time.slice(0, 2)}:${latest.time.slice(2, 4)}:00`)
        : new Date();
      return { trackingNumber, status: "delivered", description, deliveredAt: isNaN(deliveredAt.getTime()) ? new Date() : deliveredAt };
    }

    if (statusType === "O" || description.toLowerCase().includes("out for delivery")) {
      return { trackingNumber, status: "out_for_delivery", description };
    }

    if (statusType === "X") {
      return { trackingNumber, status: "exception", description };
    }

    return { trackingNumber, status: "in_transit", description };
  } catch (err) {
    console.error(`UPS tracking error for ${trackingNumber}:`, err);
    return { trackingNumber, status: "unknown", description: "Network error checking UPS" };
  }
}
