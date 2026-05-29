import { requireAdminSession } from "@/lib/admin-auth";
import ArtisanForm from "../ArtisanForm";

export default async function NewArtisanPage() {
  await requireAdminSession();
  return <ArtisanForm />;
}
