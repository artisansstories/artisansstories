import { NextRequest } from "next/server";
import { withApiKey, corsPreflight, jsonOk, SCOPE_STORE_READ } from "@/lib/api-v1";

/**
 * GET /api/v1/store/categories
 * Active categories (tenant-scoped) with an ACTIVE-product count each.
 * Returns a flat list carrying `parentId` so the client can build the tree.
 */
export async function GET(req: NextRequest) {
  return withApiKey(req, SCOPE_STORE_READ, async ({ db }) => {
    const categories = await db.category.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        parentId: true,
        _count: {
          select: { products: { where: { product: { status: "ACTIVE" } } } },
        },
      },
    });

    return jsonOk({
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        parentId: c.parentId,
        productCount: c._count.products,
      })),
    });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
