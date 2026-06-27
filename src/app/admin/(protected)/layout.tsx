import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { AdminLayoutClient } from "./AdminLayoutClient";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { safeAdminCallback } from "@/lib/safe-callback";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, settings] = await Promise.all([
    getAdminSession(),
    prisma.storeSettings.findUnique({ where: { id: "singleton" }, select: { storeName: true, adminLogoSize: true } }).catch(() => null),
  ]);

  if (!session) {
    const hdrs = await headers();
    const current = safeAdminCallback(hdrs.get("x-pathname"));
    const qs = current && current !== "/admin" ? `?callbackUrl=${encodeURIComponent(current)}` : "";
    redirect(`/admin/login${qs}`);
  }

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
