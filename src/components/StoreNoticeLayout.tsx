import StoreNoticeBanner from "./StoreNoticeBanner";
import StoreAnalytics from "./StoreAnalytics";

/** Layout for single storefront pages that render their own nav: analytics + notice banner on top. */
export default function StoreNoticeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StoreAnalytics />
      <StoreNoticeBanner />
      {children}
    </>
  );
}
