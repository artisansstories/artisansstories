import { getAdminSession } from "@/lib/admin-auth";
import { isHouseTenant } from "@/lib/tenant-features";
import { prisma } from "@/lib/prisma";
import { AdminLayoutClient } from "./AdminLayoutClient";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, settings] = await Promise.all([
    getAdminSession(),
    prisma.storeSettings.findUnique({ where: { id: "singleton" }, select: { storeName: true, adminLogoSize: true } }).catch(() => null),
  ]);

  if (!session) {
    redirect("/admin/login");
  }

  // Impersonation (P10): when a platform operator minted this session, surface an
  // unmissable banner. The session JWT carries the claim; we resolve the target
  // tenant name for display. Normal logins have no `impersonatedBy` → no banner.
  let impersonation: { impersonatorEmail: string; tenantName: string; adminEmail: string } | null = null;
  if (session.impersonatedBy) {
    const tenant = session.tenantId
      ? await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true } }).catch(() => null)
      : null;
    impersonation = {
      impersonatorEmail: session.impersonatorEmail ?? "platform operator",
      tenantName: tenant?.name ?? session.tenantId ?? "this store",
      adminEmail: session.email,
    };
  }

  return (
    <AdminLayoutClient
      session={session}
      impersonation={impersonation}
      storeName={settings?.storeName ?? "Artisans Stories"}
      adminLogoSize={settings?.adminLogoSize ?? 280}
      isHouse={isHouseTenant(session.tenantId)}
    >
      {children}
    </AdminLayoutClient>
  );
}
