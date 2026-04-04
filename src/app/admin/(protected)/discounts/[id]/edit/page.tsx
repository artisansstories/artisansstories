import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import DiscountForm from "../../DiscountForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDiscountPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const { id } = await params;

  const discount = await prisma.discount.findUnique({ where: { id } });
  if (!discount) notFound();

  // Serialize for the client component
  const serialized = {
    id: discount.id,
    code: discount.code,
    type: discount.type as "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING",
    value: discount.value,
    minimumOrderAmount: discount.minimumOrderAmount,
    appliesToAll: discount.appliesToAll,
    productIds: discount.productIds,
    categoryIds: discount.categoryIds,
    usageLimit: discount.usageLimit,
    perCustomerLimit: discount.perCustomerLimit,
    startsAt: discount.startsAt ? discount.startsAt.toISOString() : null,
    endsAt: discount.endsAt ? discount.endsAt.toISOString() : null,
    isActive: discount.isActive,
  };

  return <DiscountForm discount={serialized} />;
}
