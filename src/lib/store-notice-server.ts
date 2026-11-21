/**
 * store-notice-server.ts — load the notice banner for a storefront request.
 * Runs per request (callers read headers or are already dynamic), so a notice
 * appears, and expires, without waiting on any cache.
 */
import { prisma } from "./prisma";
import { noticeStatus, noticeDismissKey, type NoticeStyle } from "./store-notice";

export interface LiveNotice {
  dismissKey: string;
  message: string;
  linkLabel: string | null;
  linkUrl: string | null;
  style: NoticeStyle;
}

/**
 * The tenant's notice if it is live right now AND the store itself is live
 * (never on the Coming Soon page). Any DB error hides the banner instead of
 * breaking the storefront.
 */
export async function getLiveNotice(tenantId: string, now = new Date()): Promise<LiveNotice | null> {
  try {
    const [settings, notice] = await Promise.all([
      prisma.storeSettings.findFirst({ where: { tenantId }, select: { storeEnabled: true } }),
      prisma.storeNotice.findUnique({ where: { tenantId } }),
    ]);
    if (!settings?.storeEnabled || !notice) return null;
    if (noticeStatus(notice, now) !== "live") return null;
    return {
      dismissKey: noticeDismissKey(notice),
      message: notice.message,
      linkLabel: notice.linkLabel,
      linkUrl: notice.linkUrl,
      style: notice.style as NoticeStyle,
    };
  } catch (err) {
    console.error("[store-notice] load failed:", err);
    return null;
  }
}
