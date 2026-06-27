import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();
    await requireAdminSession();
    const artisans = await db.artisan.findMany({
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        products: true,
      },
      orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ artisans });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();
    await requireAdminSession();
    const body = await request.json();
    const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const artisan = await db.artisan.create({
      data: {
        tenantId: db.$tenantId,
        slug,
        name: body.name,
        status: body.status ?? "DRAFT",
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
      },
    });
    revalidatePath("/artisans");
    revalidatePath("/");
    return NextResponse.json({ artisan });
  } catch (err) {
    console.error("[POST /api/admin/artisans]", err);
    return NextResponse.json({ error: "Failed to create artisan" }, { status: 500 });
  }
}
