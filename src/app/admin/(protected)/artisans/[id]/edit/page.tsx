import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ArtisanForm from "../../ArtisanForm";

interface PageProps { params: Promise<{ id: string }>; }

export default async function EditArtisanPage({ params }: PageProps) {
  await requireAdminSession();
  const { id } = await params;

  const artisan = await prisma.artisan.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });

  if (!artisan) notFound();

  const serialized = {
    id: artisan.id,
    slug: artisan.slug,
    name: artisan.name,
    status: artisan.status as "DRAFT" | "ACTIVE",
    tagline: artisan.tagline ?? undefined,
    quote: artisan.quote ?? undefined,
    story: artisan.story ?? undefined,
    heroImageUrl: artisan.heroImageUrl ?? null,
    avatarUrl: artisan.avatarUrl ?? null,
    originCountry: artisan.originCountry,
    city: artisan.city ?? undefined,
    region: artisan.region ?? undefined,
    craft: artisan.craft ?? undefined,
    practicingSince: artisan.practicingSince ?? null,
    letterToBuyer: artisan.letterToBuyer ?? undefined,
    socialLinks: (artisan.socialLinks as Record<string, string> | null) ?? null,
    featuredPosts: (artisan.featuredPosts as { instagram?: string[]; tiktok?: string[]; displayCount?: number } | null) ?? null,
    metaTitle: artisan.metaTitle ?? undefined,
    metaDescription: artisan.metaDescription ?? undefined,
    isFeatured: artisan.isFeatured,
    images: artisan.images.map((img) => ({
      id: img.id,
      url: img.url,
      urlThumb: img.urlThumb ?? null,
      urlMedium: img.urlMedium ?? null,
      altText: img.altText ?? null,
      caption: img.caption ?? null,
      category: img.category,
      position: img.position,
    })),
  };

  return <ArtisanForm artisan={serialized} />;
}
