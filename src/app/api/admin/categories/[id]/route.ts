import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
async function makeUniqueSlug(base: string, excludeId: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.category.findFirst({
      where: { slug, NOT: { id: excludeId } },
    });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          orderBy: { position: "asc" },
          include: { _count: { select: { products: true } } },
        },
        products: {
          include: {
            product: {
              select: { id: true, name: true, slug: true, status: true, price: true },
            },
          },
        },
        _count: { select: { products: true } },
      },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({ category });
  } catch (err) {
    console.error("GET /api/admin/categories/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    const body = await request.json() as {
      name?: string;
      description?: string;
      parentId?: string | null;
      imageUrl?: string;
      isActive?: boolean;
      position?: number;
    };
    const updateData: Parameters<typeof prisma.category.update>[0]["data"] = {};
    if (body.name !== undefined) {
      updateData.name = body.name;
      const baseSlug = generateSlug(body.name);
      updateData.slug = await makeUniqueSlug(baseSlug, id);
    }
    if (body.description !== undefined) updateData.description = body.description;
    if (body.parentId !== undefined) updateData.parentId = body.parentId;
    if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.position !== undefined) updateData.position = body.position;
    const category = await prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: { orderBy: { position: "asc" } },
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json({ category });
  } catch (err) {
    console.error("PUT /api/admin/categories/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    
    
    const { id } = await params;
    const existing = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    if (existing._count.products > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: ${existing._count.products} product(s) are assigned to this category. Remove them first.`,
          productCount: existing._count.products,
        },
        { status: 400 }
      );
    }
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/categories/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
