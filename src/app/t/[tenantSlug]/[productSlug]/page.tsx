/**
 * /t/[tenantSlug]/[productSlug]/page.tsx — Branded product detail (P5)
 *
 * Server component. Resolves the tenant, then fetches the product by slug
 * through the tenant-SCOPED Prisma client (status must be ACTIVE). notFound()
 * if either the tenant or product is missing. The interactive buy box (gallery,
 * options, quantity, add-to-cart) lives in a client island; all brand styling
 * flows through `--brand-*` CSS vars from the layout.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { getStorefrontTenant } from "@/lib/storefront";
import ProductDetailClient, { type ProductDetail } from "../_components/ProductDetailClient";

const DETAIL_SELECT = {
  slug: true,
  name: true,
  price: true,
  compareAtPrice: true,
  description: true,
  story: true,
  artisanName: true,
  materialsUsed: true,
  originCountry: true,
  images: {
    orderBy: { position: "asc" as const },
    select: { url: true, urlMedium: true, altText: true },
  },
  options: {
    orderBy: { position: "asc" as const },
    select: { name: true, values: true },
  },
  variants: {
    orderBy: { position: "asc" as const },
    select: { id: true, name: true, price: true },
  },
} as const;

async function loadProduct(tenantSlug: string, productSlug: string) {
  const tenant = await getStorefrontTenant(tenantSlug);
  if (!tenant) return null;
  const db = getTenantPrisma(tenant.id);
  const product = await db.product.findFirst({
    where: { slug: productSlug, status: "ACTIVE" },
    select: DETAIL_SELECT,
  });
  if (!product) return null;
  return { tenant, product };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string; productSlug: string }>;
}): Promise<Metadata> {
  const { tenantSlug, productSlug } = await params;
  const data = await loadProduct(tenantSlug, productSlug);
  if (!data) return { title: "Product not found" };
  return {
    title: `${data.product.name} — ${data.tenant.name}`,
    description: data.product.description ?? `${data.product.name} from ${data.tenant.name}.`,
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; productSlug: string }>;
}) {
  const { tenantSlug, productSlug } = await params;
  const data = await loadProduct(tenantSlug, productSlug);
  if (!data) notFound();

  const { tenant, product } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-stone-500">
        <Link href="/" className="brand-link transition-colors hover:underline">
          Shop
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-stone-700">{product.name}</span>
      </nav>

      <ProductDetailClient product={product as ProductDetail} />
    </div>
  );
}
