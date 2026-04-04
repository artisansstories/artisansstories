import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductStatus } from "@prisma/client";

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function makeUniqueSlug(base: string, excludeId: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.product.findFirst({
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
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        categories: { include: { category: true } },
        images: { orderBy: { position: "asc" } },
        variants: {
          orderBy: { position: "asc" },
          include: { inventory: true, images: true },
        },
        options: { orderBy: { position: "asc" } },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (err) {
    console.error("GET /api/admin/products/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const body = await request.json() as {
      name?: string;
      description?: string;
      story?: string;
      price?: number;
      compareAtPrice?: number;
      costPrice?: number;
      status?: ProductStatus;
      categoryIds?: string[];
      tags?: string[];
      artisanName?: string;
      originCountry?: string;
      materialsUsed?: string[];
      requiresShipping?: boolean;
      weight?: number;
      weightUnit?: string;
      length?: number;
      width?: number;
      height?: number;
      dimensionUnit?: string;
      seoTitle?: string;
      seoDescription?: string;
      isFeatured?: boolean;
    };

    let slug = existing.slug;
    if (body.name && body.name !== existing.name) {
      const baseSlug = generateSlug(body.name);
      slug = await makeUniqueSlug(baseSlug, id);
    }

    const updateData: Parameters<typeof prisma.product.update>[0]["data"] = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (slug !== existing.slug) updateData.slug = slug;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.story !== undefined) updateData.story = body.story;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.compareAtPrice !== undefined) updateData.compareAtPrice = body.compareAtPrice;
    if (body.costPrice !== undefined) updateData.costPrice = body.costPrice;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.artisanName !== undefined) updateData.artisanName = body.artisanName;
    if (body.originCountry !== undefined) updateData.originCountry = body.originCountry;
    if (body.materialsUsed !== undefined) updateData.materialsUsed = body.materialsUsed;
    if (body.requiresShipping !== undefined) updateData.requiresShipping = body.requiresShipping;
    if (body.weight !== undefined) updateData.weight = body.weight;
    if (body.weightUnit !== undefined) updateData.weightUnit = body.weightUnit;
    if (body.length !== undefined) updateData.length = body.length;
    if (body.width !== undefined) updateData.width = body.width;
    if (body.height !== undefined) updateData.height = body.height;
    if (body.dimensionUnit !== undefined) updateData.dimensionUnit = body.dimensionUnit;
    if (body.seoTitle !== undefined) updateData.seoTitle = body.seoTitle;
    if (body.seoDescription !== undefined) updateData.seoDescription = body.seoDescription;
    if (body.isFeatured !== undefined) updateData.isFeatured = body.isFeatured;

    // Update categories if provided
    if (body.categoryIds !== undefined) {
      updateData.categories = {
        deleteMany: {},
        create: body.categoryIds.map((categoryId) => ({ categoryId })),
      };
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        categories: { include: { category: true } },
        images: { orderBy: { position: "asc" } },
        variants: {
          orderBy: { position: "asc" },
          include: { inventory: true, images: true },
        },
        options: { orderBy: { position: "asc" } },
      },
    });

    return NextResponse.json({ product });
  } catch (err) {
    console.error("PUT /api/admin/products/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    await prisma.product.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/products/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
