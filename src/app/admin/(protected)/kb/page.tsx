import { getAdminSession } from "@/lib/admin-auth";
import { isHouseTenant } from "@/lib/tenant-features";
import { redirect } from "next/navigation";
import KBClient from "./KBClient";

export default async function KBPage() {
  const session = await getAdminSession();
  if (!isHouseTenant(session?.tenantId)) redirect("/admin");
  return <KBClient />;
}
