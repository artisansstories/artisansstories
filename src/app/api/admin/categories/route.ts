import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
import type { TenantPrisma } from "@/lib/tenant-prisma";
function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
// Slug uniqueness must be checked through the tenant-scoped client so the lookup
// only sees THIS tenant's rows (slugs are unique per-tenant, not globally).
async function makeUniqueSlug(db: TenantPrisma, base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await db.category.findFirst({ where: { slug } });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}
export async function GET(_request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const categories = await db.category.findMany({
      orderBy: { position: "asc" },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: { select: { id: true, name: true, slug: true, isActive: true, position: true } },
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("GET /api/admin/categories error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const db = await getTenantPrismaForAdmin();

    const body = await request.json() as {
      name: string;
      description?: string;
      parentId?: string;
      imageUrl?: string;
      isActive?: boolean;
      position?: number;
    };
    if (!body.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const baseSlug = generateSlug(body.name);
    const slug = await makeUniqueSlug(db, baseSlug);
    const maxPosition = await db.category.aggregate({ _max: { position: true } });
    const position = body.position ?? (maxPosition._max.position ?? 0) + 1;
    const category = await db.category.create({
      data: {
        tenantId: db.$tenantId,
        name: body.name,
        slug,
        description: body.description,
        parentId: body.parentId ?? null,
        imageUrl: body.imageUrl,
        isActive: body.isActive ?? true,
        position,
      },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/categories error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
