import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { AdminLayoutClient } from "./AdminLayoutClient";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, settings] = await Promise.all([
    getAdminSession(),
    prisma.storeSettings.findUnique({ where: { id: "singleton" }, select: { storeName: true, adminLogoSize: true } }).catch(() => null),
  ]);
  return (
    <AdminLayoutClient
      session={session}
      storeName={settings?.storeName ?? "Artisans Stories"}
      adminLogoSize={settings?.adminLogoSize ?? 280}
    >
      {children}
    </AdminLayoutClient>
  );
}
