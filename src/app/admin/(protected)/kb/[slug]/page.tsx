import { getAdminSession } from "@/lib/admin-auth";
import { isHouseTenant } from "@/lib/tenant-features";
import { redirect } from "next/navigation";
import KBArticleClient from "./KBArticleClient";

export default async function KBArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getAdminSession();
  if (!isHouseTenant(session?.tenantId)) redirect("/admin");
  return <KBArticleClient params={params} />;
}
