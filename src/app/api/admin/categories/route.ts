import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function makeUniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const categories = await prisma.category.findMany({
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
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const slug = await makeUniqueSlug(baseSlug);

    const maxPosition = await prisma.category.aggregate({ _max: { position: true } });
    const position = body.position ?? (maxPosition._max.position ?? 0) + 1;

    const category = await prisma.category.create({
      data: {
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
