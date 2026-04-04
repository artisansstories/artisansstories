import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import EditProductClient from "./EditProductClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: PageProps) {
  const session = await requireAdminSession();

  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      categories: { include: { category: true } },
      images: { orderBy: { position: "asc" } },
      variants: {
        orderBy: { position: "asc" },
        include: { inventory: true },
      },
      options: { orderBy: { position: "asc" } },
    },
  });

  if (!product) notFound();

  // Serialize for client
  const serialized = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    story: product.story ?? "",
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    costPrice: product.costPrice,
    status: product.status as "DRAFT" | "ACTIVE" | "ARCHIVED",
    categoryIds: product.categories.map((c) => c.categoryId),
    tags: product.tags,
    artisanName: product.artisanName ?? "",
    originCountry: product.originCountry,
    materialsUsed: product.materialsUsed,
    requiresShipping: product.requiresShipping,
    weight: product.weight,
    weightUnit: product.weightUnit,
    length: product.length,
    width: product.width,
    height: product.height,
    dimensionUnit: product.dimensionUnit,
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
    isFeatured: product.isFeatured,
    images: product.images.map((img) => ({
      id: img.id,
      url: img.url,
      urlThumb: img.urlThumb,
      urlMedium: img.urlMedium,
      altText: img.altText,
      position: img.position,
      isDefault: img.isDefault,
      width: img.width,
      height: img.height,
      size: img.size,
    })),
    variants: product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku ?? undefined,
      price: v.price,
      quantity: v.inventory?.quantity ?? 0,
      optionValues: (v.optionValues as Record<string, string>) ?? {},
      position: v.position,
    })),
    options: product.options.map((o) => ({
      id: o.id,
      name: o.name,
      values: o.values,
      position: o.position,
    })),
  };

  return <EditProductClient product={serialized} />;
}
