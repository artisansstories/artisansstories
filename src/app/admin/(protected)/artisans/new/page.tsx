import { requireAdminSession } from "@/lib/admin-auth";
import { isHouseTenant } from "@/lib/tenant-features";
import { redirect } from "next/navigation";
import ArtisanForm from "../ArtisanForm";

export default async function NewArtisanPage() {
  const session = await requireAdminSession();
  if (!isHouseTenant(session.tenantId)) redirect("/admin");
  return <ArtisanForm />;
}
