import { getAdminSession } from "@/lib/admin-auth";
import { AdminLayoutClient } from "./AdminLayoutClient";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  return (
    <AdminLayoutClient session={session}>
      {children}
    </AdminLayoutClient>
  );
}
