"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { scrubUrl } from "@/lib/analytics";

/** Vercel Web Analytics for shopper-facing pages; admin and platform visits are dropped, PII query params removed. */
function dropBackOffice(event: BeforeSendEvent): BeforeSendEvent | null {
  const path = new URL(event.url).pathname;
  return /^\/(admin|platform)(\/|$)/.test(path) ? null : { ...event, url: scrubUrl(event.url) };
}

export default function VercelAnalytics() {
  return <Analytics beforeSend={dropBackOffice} />;
}
