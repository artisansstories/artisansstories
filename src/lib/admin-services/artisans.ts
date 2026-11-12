/**
 * admin-services/artisans.ts — artisan logic shared by /api/admin/artisans/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged), plus
 * read-only `preview*` helpers and a merge helper used by MCP write tools.
 *
 * PUT semantics: a field absent from the body keeps its current value; a field
 * sent as null is cleared (see FIELD_WRITERS). It used to be a full replacement,
 * so every admin-form save nulled the fields the form doesn't send. MCP updates
 * still go through `mergeArtisanPatch` for their before/after preview.
 */
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, fail } from "./result";

/** Loosely-typed request body, exactly as the routes accepted it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArtisanBody = Record<string, any>;

/** Instagram OAuth fields — never returned to MCP clients. */
const SECRET_FIELDS = ["igAccessToken", "igTokenExpiry", "igUserId"] as const;

export function stripArtisanSecrets<T extends Record<string, unknown>>(a: T): Omit<T, (typeof SECRET_FIELDS)[number]> {
  const out: Record<string, unknown> = { ...a };
  for (const k of SECRET_FIELDS) delete out[k];
  return out as Omit<T, (typeof SECRET_FIELDS)[number]>;
}

// ── list / get ──────────────────────────────────────────────────────────────

export async function listArtisans(db: TenantPrisma) {
  const artisans = await db.artisan.findMany({
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      products: true,
    },
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
  });
  return ok({ artisans });
}

export async function getArtisan(db: TenantPrisma, id: string) {
  const artisan = await db.artisan.findUnique({
    where: { id },
    include: {
      images: { orderBy: { position: "asc" } },
      products: { include: { product: { select: { id: true, name: true, slug: true } } } },
    },
  });
  if (!artisan) return fail(404, "Not found");
  return ok({ artisan });
}

// ── create ──────────────────────────────────────────────────────────────────

function slugFor(body: ArtisanBody): string {
  return body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createArtisan(db: TenantPrisma, body: ArtisanBody) {
  const slug = slugFor(body);
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
  return ok({ artisan });
}

export async function previewCreateArtisan(db: TenantPrisma, body: ArtisanBody) {
  const slug = slugFor(body);
  const clash = await db.artisan.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (clash) return fail(409, `Slug "${slug}" is already used by artisan "${clash.name}"`, { existingId: clash.id });
  const status = body.status ?? "DRAFT";
  return ok({
    action: "create",
    slug,
    name: body.name,
    status,
    publishes: status === "ACTIVE",
    publicUrl: status === "ACTIVE" ? `/artisans/${slug}` : null,
    note:
      status === "ACTIVE"
        ? "The artisan will be publicly visible on the storefront immediately."
        : "Created as DRAFT; not publicly visible until status is ACTIVE.",
    fields: body,
  });
}

// ── update ──────────────────────────────────────────────────────────────────

/**
 * How each PUT field is written when it is present in the body. A field that is
 * ABSENT keeps its current value; one sent as null (or "" for text) is cleared
 * to null / its default. This is what lets the admin form, which never sends
 * region, practicingSince, featuredPosts or socialEmbedCode, save without
 * wiping them, while an explicit clear still works.
 */
const FIELD_WRITERS: Record<string, (v: unknown) => unknown> = {
  name: (v) => v,
  status: (v) => v ?? undefined,
  tagline: (v) => v ?? null,
  quote: (v) => v ?? null,
  story: (v) => v ?? null,
  heroImageUrl: (v) => v ?? null,
  avatarUrl: (v) => v ?? null,
  originCountry: (v) => v ?? "El Salvador",
  city: (v) => v ?? null,
  region: (v) => v ?? null,
  craft: (v) => v ?? null,
  practicingSince: (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  },
  letterToBuyer: (v) => v ?? null,
  socialLinks: (v) => v ?? Prisma.DbNull,
  featuredPosts: (v) => v ?? Prisma.DbNull,
  showGallery: (v) => v ?? true,
  socialEmbedCode: (v) => v ?? null,
  socialLinksVisible: (v) => v ?? Prisma.DbNull,
  storyLabel: (v) => v ?? null,
  metaTitle: (v) => v ?? null,
  metaDescription: (v) => v ?? null,
  isFeatured: (v) => v ?? false,
};

export async function updateArtisan(db: TenantPrisma, id: string, body: ArtisanBody) {
  // Lock slug after first active publish
  const existing = await db.artisan.findUnique({ where: { id }, select: { slug: true, status: true } });
  if (!existing) return fail(404, "Not found");
  const slug = existing.status === "ACTIVE" ? existing.slug : (body.slug || existing.slug);

  const updateData: Record<string, unknown> = { slug };
  for (const [field, write] of Object.entries(FIELD_WRITERS)) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const value = write(body[field]);
    if (value !== undefined) updateData[field] = value;
  }

  // Profile and gallery are saved together or not at all.
  const tenantId = db.$tenantId;
  const updated = await db.$transaction(async (tx) => {
    await tx.artisan.update({ where: { id }, data: updateData });

    // Rebuild images
    if (Array.isArray(body.images)) {
      await tx.artisanImage.deleteMany({ where: { artisanId: id } });
      if (body.images.length > 0) {
        await tx.artisanImage.createMany({
          data: body.images.map((img: Record<string, unknown>, i: number) => ({
            tenantId,
            artisanId: id,
            url: img.url as string,
            urlMedium: (img.urlMedium ?? null) as string | null,
            urlThumb: (img.urlThumb ?? null) as string | null,
            altText: (img.altText ?? null) as string | null,
            caption: (img.caption ?? null) as string | null,
            category: (img.category ?? "GALLERY") as string,
            position: (img.position ?? i) as number,
          })) as Prisma.ArtisanImageCreateManyInput[],
        });
      }
    }

    return tx.artisan.findUnique({
      where: { id },
      include: { images: { orderBy: { position: "asc" } }, products: true },
    });
  });

  // Bust Next.js cache so changes show immediately on the live site
  revalidatePath("/artisans");
  if (updated?.slug) revalidatePath(`/artisans/${updated.slug}`);
  revalidatePath("/");

  return ok({ artisan: updated });
}

/** Fields the PUT route can write (everything except Instagram OAuth fields). */
const UPDATABLE_FIELDS = [
  "slug", "name", "status", "tagline", "quote", "story", "heroImageUrl", "avatarUrl",
  "originCountry", "city", "region", "craft", "practicingSince", "letterToBuyer",
  "socialLinks", "featuredPosts", "showGallery", "socialEmbedCode", "socialLinksVisible",
  "storyLabel", "metaTitle", "metaDescription", "isFeatured",
] as const;

/**
 * MCP partial update → full PUT body: current values overlaid with the patch.
 * `images`, when given, replaces the whole gallery; when absent images are untouched.
 */
export async function mergeArtisanPatch(db: TenantPrisma, id: string, patch: ArtisanBody) {
  const current = await db.artisan.findUnique({ where: { id } });
  if (!current) return fail(404, "Not found");
  const body: ArtisanBody = {};
  for (const k of UPDATABLE_FIELDS) {
    body[k] = patch[k] !== undefined ? patch[k] : (current as Record<string, unknown>)[k];
  }
  if (Array.isArray(patch.images)) body.images = patch.images;
  return ok({ current, body });
}

export async function previewUpdateArtisan(db: TenantPrisma, id: string, patch: ArtisanBody) {
  const m = await mergeArtisanPatch(db, id, patch);
  if (!m.ok) return m;
  const { current, body } = m.data;
  const cur = current as Record<string, unknown>;
  const slugLocked = current.status === "ACTIVE";
  const finalSlug = slugLocked ? current.slug : (body.slug || current.slug);
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of UPDATABLE_FIELDS) {
    const after = k === "slug" ? finalSlug : body[k];
    if (JSON.stringify(cur[k] ?? null) !== JSON.stringify(after ?? null)) changes[k] = { before: cur[k] ?? null, after };
  }
  let images: unknown = "unchanged";
  if (Array.isArray(body.images)) {
    const count = await db.artisanImage.count({ where: { artisanId: id } });
    images = { action: "replace all", deleting: count, creating: body.images.length };
  }
  const newStatus = body.status ?? current.status;
  return ok({
    artisanId: id,
    name: current.name,
    changes,
    images,
    slugLocked,
    ...(slugLocked && patch.slug && patch.slug !== current.slug
      ? { slugNote: `Slug is locked because the artisan is ACTIVE; it stays "${current.slug}".` }
      : {}),
    publishes: newStatus === "ACTIVE" && current.status !== "ACTIVE",
    unpublishes: newStatus !== "ACTIVE" && current.status === "ACTIVE",
    publiclyVisibleAfter: newStatus === "ACTIVE",
    publicUrl: newStatus === "ACTIVE" ? `/artisans/${finalSlug}` : null,
  });
}

// ── delete ──────────────────────────────────────────────────────────────────

export async function deleteArtisan(db: TenantPrisma, id: string) {
  await db.artisan.delete({ where: { id } });
  return ok({ ok: true });
}

export async function previewDeleteArtisan(db: TenantPrisma, id: string) {
  const a = await db.artisan.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, status: true, _count: { select: { images: true, products: true } } },
  });
  if (!a) return fail(404, "Not found");
  return ok({
    action: "delete (permanent)",
    artisan: { id: a.id, name: a.name, slug: a.slug, status: a.status },
    alsoDeleted: { images: a._count.images, productLinks: a._count.products },
    note:
      (a.status === "ACTIVE" ? `The public page /artisans/${a.slug} will stop working. ` : "") +
      "Linked products themselves are not deleted, only their link to this artisan.",
  });
}
