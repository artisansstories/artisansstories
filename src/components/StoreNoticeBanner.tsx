import { headers } from "next/headers";
import { resolveTenantFromHost } from "@/lib/tenant-context";
import { getLiveNotice } from "@/lib/store-notice-server";
import StoreNoticeBar from "./StoreNoticeBar";

/**
 * Server component: the live storefront notice for this store, or nothing.
 * Pass `tenantId` when the caller already knows it (/t/[tenantSlug]);
 * otherwise the store comes from the request host.
 */
export default async function StoreNoticeBanner({ tenantId }: { tenantId?: string }) {
  let id = tenantId;
  if (!id) {
    try {
      id = await resolveTenantFromHost({ headers: await headers() });
    } catch {
      return null;
    }
  }
  const notice = await getLiveNotice(id);
  return notice ? <StoreNoticeBar notice={notice} /> : null;
}
