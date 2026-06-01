import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const artisan = await prisma.artisan.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: "asc" } },
        products: { include: { product: { select: { id: true, name: true, slug: true } } } },
      },
    });
    if (!artisan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ artisan });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const body = await request.json();

    // Lock slug after first active publish
    const existing = await prisma.artisan.findUnique({ where: { id }, select: { slug: true, status: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const slug = existing.status === "ACTIVE" ? existing.slug : (body.slug || existing.slug);

    const updateData: Record<string, unknown> = {
      slug,
      name: body.name,
      status: body.status,
      tagline: body.tagline ?? null,
      quote: body.quote ?? null,
      story: body.story ?? null,
      heroImageUrl: body.heroImageUrl ?? null,
      avatarUrl: body.avatarUrl ?? null,
      originCountry: body.originCountry ?? "El Salvador",
      city: body.city ?? null,
      region: body.region ?? null,
      craft: body.craft ?? null,
      practicingSince: body.practicingSince ? parseInt(body.practicingSince) : null,
      letterToBuyer: body.letterToBuyer ?? null,
      socialLinks: body.socialLinks ?? null,
      featuredPosts: body.featuredPosts ?? null,
      showGallery: body.showGallery ?? true,
      socialEmbedCode: body.socialEmbedCode ?? null,
      socialLinksVisible: body.socialLinksVisible ?? null,
      storyLabel: body.storyLabel ?? null,
      metaTitle: body.metaTitle ?? null,
      metaDescription: body.metaDescription ?? null,
      isFeatured: body.isFeatured ?? false,
    };

    await prisma.artisan.update({ where: { id }, data: updateData });

    // Rebuild images
    if (Array.isArray(body.images)) {
      await prisma.artisanImage.deleteMany({ where: { artisanId: id } });
      if (body.images.length > 0) {
        await prisma.artisanImage.createMany({
          data: body.images.map((img: Record<string, unknown>, i: number) => ({
            artisanId: id,
            url: img.url as string,
            urlMedium: (img.urlMedium ?? null) as string | null,
            urlThumb: (img.urlThumb ?? null) as string | null,
            altText: (img.altText ?? null) as string | null,
            caption: (img.caption ?? null) as string | null,
            category: (img.category ?? "GALLERY") as string,
            position: (img.position ?? i) as number,
          })),
        });
      }
    }

    const updated = await prisma.artisan.findUnique({
      where: { id },
      include: { images: { orderBy: { position: "asc" } }, products: true },
    });

    // Bust Next.js cache so changes show immediately on the live site
    revalidatePath("/artisans");
    if (updated?.slug) revalidatePath(`/artisans/${updated.slug}`);
    revalidatePath("/");

    return NextResponse.json({ artisan: updated });
  } catch (err) {
    console.error("[PUT /api/admin/artisans/[id]]", err);
    return NextResponse.json({ error: "Failed to update artisan" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await params;
    await prisma.artisan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/admin/artisans/[id]]", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
