import { getAdminSession } from "@/lib/admin-auth";
import { isHouseTenant } from "@/lib/tenant-features";
import { redirect } from "next/navigation";
import LinktreeClient from "./LinktreeClient";

export default async function LinktreePage() {
  const session = await getAdminSession();
  if (!isHouseTenant(session?.tenantId)) {
    redirect("/admin");
  }
  return <LinktreeClient />;
}
