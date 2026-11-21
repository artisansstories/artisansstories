import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromHost } from "@/lib/tenant-context";
import { validGaId, validPixelId } from "@/lib/analytics-ids";
import StoreAnalyticsClient from "./StoreAnalyticsClient";

/**
 * Server component for storefront layouts: the store's own GA4 / Meta Pixel,
 * or nothing. IDs are re-validated here, so a malformed or legacy "TAX:"
 * value never reaches the page. Pass `tenantId` when the caller already knows
 * it (/t/[tenantSlug]); otherwise the store comes from the request host.
 * Never rendered under /admin or /platform.
 */
export default async function StoreAnalytics({ tenantId }: { tenantId?: string }) {
  try {
    const id = tenantId ?? (await resolveTenantFromHost({ headers: await headers() }));
    const settings = await prisma.storeSettings.findFirst({
      where: { tenantId: id },
      select: { googleAnalyticsId: true, facebookPixelId: true },
    });
    const gaId = validGaId(settings?.googleAnalyticsId);
    const pixelId = validPixelId(settings?.facebookPixelId);
    if (!gaId && !pixelId) return null;
    return <StoreAnalyticsClient gaId={gaId} pixelId={pixelId} />;
  } catch (err) {
    // Let Next's own signals (dynamic rendering via headers()) through.
    unstable_rethrow(err);
    console.error("[store-analytics] load failed:", err);
    return null;
  }
}
