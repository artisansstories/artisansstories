import { getAdminSession } from "@/lib/admin-auth";
import { isHouseTenant } from "@/lib/tenant-features";
import { redirect } from "next/navigation";
import LandingPageEditor from "./LandingPageEditor";

export default async function LandingPagePage() {
  const session = await getAdminSession();
  if (!isHouseTenant(session?.tenantId)) redirect("/admin");
  return <LandingPageEditor />;
}
