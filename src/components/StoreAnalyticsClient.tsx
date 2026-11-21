"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { configureAnalytics, resetAnalytics, trackPageView } from "@/lib/analytics";

/**
 * Loads the store's GA4 and/or Meta Pixel and sends a page view on every
 * App Router navigation. Rendered only by StoreAnalytics (storefront layouts)
 * and only with IDs that already passed format validation.
 */
export default function StoreAnalyticsClient({ gaId, pixelId }: { gaId: string | null; pixelId: string | null }) {
  const pathname = usePathname();

  useEffect(() => {
    configureAnalytics({ gaId, pixelId });
    trackPageView(pathname + window.location.search);
  }, [gaId, pixelId, pathname]);

  useEffect(() => () => resetAnalytics(), []);

  return (
    <>
      {gaId && (
        <Script
          id="store-ga4"
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
          strategy="afterInteractive"
        />
      )}
      {pixelId && (
        <Script id="store-meta-pixel" src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive" />
      )}
    </>
  );
}
