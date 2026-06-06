export { checkUSPS } from "./usps";
export { checkUPS } from "./ups";
export type { TrackingResult } from "./usps";

import { checkUSPS } from "./usps";
import { checkUPS } from "./ups";
import type { TrackingResult } from "./usps";

export async function checkTracking(carrier: string, trackingNumber: string): Promise<TrackingResult> {
  const c = carrier.toUpperCase().trim();
  if (c === "USPS") return checkUSPS(trackingNumber);
  if (c === "UPS") return checkUPS(trackingNumber);
  return {
    trackingNumber,
    status: "unknown",
    description: `Carrier "${carrier}" not supported yet (add USPS or UPS)`,
  };
}
