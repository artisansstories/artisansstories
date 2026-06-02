import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import NewProductClient from "./NewProductClient";

export default async function NewProductPage() {
  await requireAdminSession();
  const artisans = await prisma.artisan.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return <NewProductClient artisans={artisans} />;
}
