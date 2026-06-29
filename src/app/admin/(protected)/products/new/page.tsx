import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import NewProductClient from "./NewProductClient";

export default async function NewProductPage() {
  const session = await requireAdminSession();
  const tenantId = session.tenantId;
  const artisans = await prisma.artisan.findMany({
    where: { status: "ACTIVE", ...(tenantId ? { tenantId } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return <NewProductClient artisans={artisans} />;
}
