import StoreNoticeBanner from "./StoreNoticeBanner";

/** Layout for single storefront pages that render their own nav: notice banner on top. */
export default function StoreNoticeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StoreNoticeBanner />
      {children}
    </>
  );
}
