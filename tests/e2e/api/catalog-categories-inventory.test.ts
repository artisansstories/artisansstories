/* eslint-disable @typescript-eslint/no-explicit-any -- JSON payloads from routes/MCP */
/**
 * Catalog e2e — categories (/api/admin/categories/**, categories_* tools) and
 * inventory (/api/admin/inventory/**, inventory_* tools).
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import * as categoriesRoute from "@/app/api/admin/categories/route";
import * as categoryRoute from "@/app/api/admin/categories/[id]/route";
import * as inventoryRoute from "@/app/api/admin/inventory/route";
import * as inventoryItemRoute from "@/app/api/admin/inventory/[id]/route";

type H = never;
const C = (id: string) => `/api/admin/categories/${id}`;
const I = (id: string) => `/api/admin/inventory/${id}`;

async function withMcp<T>(key: string, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const mcp = await connectMcp(key);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}

const categoryRow = (id: string) => prisma.category.findUnique({ where: { id } }).then((c) => JSON.parse(JSON.stringify(c)));

// ── categories ───────────────────────────────────────────────────────────────

describe("categories routes: auth and bad ids", () => {
  it("every route + method is 401 without a session", async () => {
    const rs = await Promise.all([
      call(categoriesRoute.GET as H, "GET", "/api/admin/categories"),
      call(categoriesRoute.POST as H, "POST", "/api/admin/categories", { body: { name: "Hacked" } }),
      call(categoryRoute.GET as H, "GET", C(F.cat.empty), { params: { id: F.cat.empty } }),
      call(categoryRoute.PUT as H, "PUT", C(F.cat.empty), { params: { id: F.cat.empty }, body: { name: "Hacked" } }),
      call(categoryRoute.DELETE as H, "DELETE", C(F.cat.empty), { params: { id: F.cat.empty } }),
    ]);
    for (const r of rs) expect(r.status, r.text).toBe(401);
    expect(await prisma.category.count({ where: { tenantId: HOUSE } })).toBe(3);
    expect((await prisma.category.findUnique({ where: { id: F.cat.empty } }))!.name).toBe("Empty Category");
  });

  it("unknown and other-tenant ids are 404", async () => {
    await signInAs(F.admin.super);
    for (const id of ["nope", F.cat.other]) {
      expect((await call(categoryRoute.GET as H, "GET", C(id), { params: { id } })).status).toBe(404);
      expect((await call(categoryRoute.PUT as H, "PUT", C(id), { params: { id }, body: { name: "x" } })).status).toBe(404);
      expect((await call(categoryRoute.DELETE as H, "DELETE", C(id), { params: { id } })).status).toBe(404);
    }
    expect((await call(categoryRoute.PUT as H, "PUT", C("nope"), { params: { id: "nope" }, body: "{bad" })).status).toBe(404);
    expect(await prisma.category.findUnique({ where: { id: F.cat.other } })).toMatchObject({ name: "Gear", tenantId: OTHER });
  });
});

describe("categories list/get", () => {
  it("GET list and GET one return this store's categories with counts", async () => {
    await signInAs(F.admin.super);
    const list = await call(categoriesRoute.GET as H, "GET", "/api/admin/categories");
    expect(list.status).toBe(200);
    expect(list.body.categories.map((c: any) => c.id)).toEqual([F.cat.textiles, F.cat.pottery, F.cat.empty]);
    const textiles = list.body.categories[0];
    expect(textiles._count.products).toBe(1);
    expect(textiles.children.map((c: any) => c.id)).toEqual([F.cat.pottery]);
    expect(list.body.categories[1].parent).toMatchObject({ id: F.cat.textiles });

    const one = await call(categoryRoute.GET as H, "GET", C(F.cat.textiles), { params: { id: F.cat.textiles } });
    expect(one.status).toBe(200);
    expect(one.body.category.products.map((p: any) => p.product)).toEqual([{ id: F.prod.hammock, name: "Woven Hammock", slug: "hammock", status: "ACTIVE", price: 12000 }]);
    expect(one.body.category.children[0]).toMatchObject({ id: F.cat.pottery, _count: { products: 1 } });
  });

  it("MCP categories_list / categories_get", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      const list = await mcp.call("categories_list");
      expect(list.categories.map((c: any) => c.id)).toEqual([F.cat.textiles, F.cat.pottery, F.cat.empty]);
      const got = await mcp.call("categories_get", { categoryId: F.cat.pottery });
      expect(got.category).toMatchObject({ id: F.cat.pottery, parent: { id: F.cat.textiles } });
      expect(got.category.products.map((p: any) => p.product.id)).toEqual([F.prod.mug]);
      expect(await mcp.call("categories_get", { categoryId: F.cat.other })).toMatchObject({ blocked: true, status: 404 });
    });
    await withMcp(KEYS.otherRead, async (mcp) => {
      expect((await mcp.call("categories_list")).categories.map((c: any) => c.id)).toEqual([F.cat.other]);
    });
  });
});

describe("category create/update/delete", () => {
  it("POST creates (slug, default position, parent) and reads back; validation", async () => {
    await signInAs(F.admin.super);
    const r = await call(categoriesRoute.POST as H, "POST", "/api/admin/categories", { body: { name: "Wall Art & Decor", parentId: F.cat.textiles, description: "d" } });
    expect(r.status, r.text).toBe(201);
    expect(r.body.category).toMatchObject({ slug: "wall-art-decor", position: 3, isActive: true, parent: { id: F.cat.textiles }, tenantId: HOUSE });
    const got = await call(categoryRoute.GET as H, "GET", C(r.body.category.id), { params: { id: r.body.category.id } });
    expect(got.body.category).toMatchObject({ name: "Wall Art & Decor", description: "d", parentId: F.cat.textiles });
    const dup = await call(categoriesRoute.POST as H, "POST", "/api/admin/categories", { body: { name: "Pottery" } });
    expect(dup.body.category.slug).toBe("pottery-1");

    const before = await prisma.category.count();
    const noName = await call(categoriesRoute.POST as H, "POST", "/api/admin/categories", { body: {} });
    expect(noName.status).toBe(400);
    for (const parentId of ["nope", F.cat.other]) {
      const bad = await call(categoriesRoute.POST as H, "POST", "/api/admin/categories", { body: { name: "Orphan", parentId } });
      expect(bad.status, `${parentId}: ${bad.text}`).toBe(404);
    }
    expect(await prisma.category.count()).toBe(before);
  });

  it("PUT updates fields + slug, makes top-level; refuses self / missing / foreign parents", async () => {
    await signInAs(F.admin.super);
    const r = await call(categoryRoute.PUT as H, "PUT", C(F.cat.pottery), { params: { id: F.cat.pottery }, body: { name: "Ceramics", isActive: false, position: 9, parentId: null } });
    expect(r.status, r.text).toBe(200);
    const got = await call(categoryRoute.GET as H, "GET", C(F.cat.pottery), { params: { id: F.cat.pottery } });
    expect(got.body.category).toMatchObject({ name: "Ceramics", slug: "ceramics", isActive: false, position: 9, parentId: null });

    const before = await categoryRow(F.cat.empty);
    for (const parentId of [F.cat.empty, "nope", F.cat.other]) {
      const bad = await call(categoryRoute.PUT as H, "PUT", C(F.cat.empty), { params: { id: F.cat.empty }, body: { name: "Renamed", parentId } });
      expect(bad.status, `${parentId}: ${bad.text}`).toBeGreaterThanOrEqual(400);
      expect(bad.status, `${parentId}: ${bad.text}`).toBeLessThan(500);
    }
    expect(await categoryRow(F.cat.empty)).toEqual(before);
  });

  it("DELETE refuses a category with products, deletes an empty one, children become top-level", async () => {
    await signInAs(F.admin.super);
    const refused = await call(categoryRoute.DELETE as H, "DELETE", C(F.cat.textiles), { params: { id: F.cat.textiles } });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ productCount: 1 });
    expect(await prisma.category.findUnique({ where: { id: F.cat.textiles } })).not.toBeNull();

    // Give the empty category a child, then delete it.
    await prisma.category.create({ data: { id: "h_cat_child", tenantId: HOUSE, slug: "child", name: "Child", parentId: F.cat.empty } });
    const del = await call(categoryRoute.DELETE as H, "DELETE", C(F.cat.empty), { params: { id: F.cat.empty } });
    expect(del.status, del.text).toBe(200);
    expect(del.body).toEqual({ success: true });
    expect((await call(categoryRoute.GET as H, "GET", C(F.cat.empty), { params: { id: F.cat.empty } })).status).toBe(404);
    expect(await prisma.category.findUnique({ where: { id: "h_cat_child" } })).toMatchObject({ parentId: null });
    const list = await call(categoriesRoute.GET as H, "GET", "/api/admin/categories");
    expect(list.body.categories.map((c: any) => c.id)).not.toContain(F.cat.empty);
  });

  it("MCP categories_create: preview, confirm, replay, read back; bad parent refused", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await prisma.category.count();
      const flow = await previewConfirmReplay(mcp, "categories_create", { name: "Jewelry", parentId: F.cat.textiles, isActive: false }, async (preview) => {
        expect(await prisma.category.count()).toBe(before);
        expect(preview.preview).toMatchObject({ slug: "jewelry", parent: { id: F.cat.textiles }, isActive: false, position: 3 });
      });
      const result = expectConfirmed(flow);
      expectReplayBlocked(flow);
      expect(await prisma.category.count()).toBe(before + 1);
      const got = await mcp.call("categories_get", { categoryId: result.category.id });
      expect(got.category).toMatchObject({ name: "Jewelry", slug: "jewelry", isActive: false, parent: { id: F.cat.textiles } });
      expect(await mcp.call("categories_create", { name: "X", parentId: F.cat.other })).toMatchObject({ blocked: true, status: 404 });
      expect(await prisma.category.count()).toBe(before + 1);
    });
  });

  it("MCP categories_update: preview diff, confirm, replay, read back; makeTopLevel; self-parent refused", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await categoryRow(F.cat.pottery);
      const flow = await previewConfirmReplay(mcp, "categories_update", { categoryId: F.cat.pottery, name: "Ceramics", makeTopLevel: true }, async (preview) => {
        expect(await categoryRow(F.cat.pottery)).toEqual(before);
        expect(preview.preview.changes).toMatchObject({ name: { from: "Pottery", to: "Ceramics" }, slug: { from: "pottery", to: "ceramics" }, parentId: { from: F.cat.textiles, to: null } });
      });
      expectConfirmed(flow);
      expectReplayBlocked(flow);
      const got = await mcp.call("categories_get", { categoryId: F.cat.pottery });
      expect(got.category).toMatchObject({ name: "Ceramics", slug: "ceramics", parentId: null, parent: null });
      expect(await mcp.call("categories_update", { categoryId: F.cat.empty, parentId: F.cat.empty })).toMatchObject({ blocked: true, status: 400 });
      expect(await mcp.call("categories_update", { categoryId: F.cat.other, name: "x" })).toMatchObject({ blocked: true, status: 404 });
    });
  });

  it("MCP categories_delete: refused with products; empty one previewed, deleted, replay blocked", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      expect(await mcp.call("categories_delete", { categoryId: F.cat.pottery })).toMatchObject({ blocked: true, status: 400, productCount: 1 });
      const flow = await previewConfirmReplay(mcp, "categories_delete", { categoryId: F.cat.empty }, async (preview) => {
        expect(await prisma.category.findUnique({ where: { id: F.cat.empty } })).not.toBeNull();
        expect(preview.preview.category).toMatchObject({ id: F.cat.empty });
      });
      expect(expectConfirmed(flow)).toEqual({ success: true });
      expectReplayBlocked(flow);
      expect(await mcp.call("categories_get", { categoryId: F.cat.empty })).toMatchObject({ blocked: true, status: 404 });
    });
  });
});

// ── inventory ────────────────────────────────────────────────────────────────

describe("inventory", () => {
  it("routes are 401 without a session; bad / foreign ids are 404", async () => {
    const list = await call(inventoryRoute.GET as H, "GET", "/api/admin/inventory");
    expect(list.status).toBe(401);
    const patch = await call(inventoryItemRoute.PATCH as H, "PATCH", I(F.inventory.hammockBlue), { params: { id: F.inventory.hammockBlue }, body: { quantity: 0 } });
    expect(patch.status).toBe(401);
    expect((await prisma.inventory.findUnique({ where: { id: F.inventory.hammockBlue } }))!.quantity).toBe(10);

    await signInAs(F.admin.super);
    for (const id of ["nope", F.inventory.other]) {
      const r = await call(inventoryItemRoute.PATCH as H, "PATCH", I(id), { params: { id }, body: { quantity: 1 } });
      expect(r.status, r.text).toBe(404);
    }
    expect((await prisma.inventory.findUnique({ where: { id: F.inventory.other } }))!.quantity).toBe(7);
  });

  it("GET lists this store, lowest first, with low-stock filter, search and paging", async () => {
    await signInAs(F.admin.super);
    const r = await call(inventoryRoute.GET as H, "GET", "/api/admin/inventory");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    expect(r.body.inventory.map((i: any) => [i.id, i.quantity])).toEqual([[F.inventory.draft, 0], [F.inventory.hammockRed, 2], [F.inventory.hammockBlue, 10]]);
    expect(r.body.inventory[2].variant.product).toMatchObject({ id: F.prod.hammock, images: [expect.objectContaining({ id: "h_pimg_1" })] });
    const low = await call(inventoryRoute.GET as H, "GET", "/api/admin/inventory", { query: { lowStock: "true" } });
    expect(low.body.inventory.map((i: any) => i.id)).toEqual([F.inventory.hammockRed]);
    const search = await call(inventoryRoute.GET as H, "GET", "/api/admin/inventory", { query: { search: "ham-001-blu" } });
    expect(search.body.inventory.map((i: any) => i.id)).toEqual([F.inventory.hammockBlue]);
    const paged = await call(inventoryRoute.GET as H, "GET", "/api/admin/inventory", { query: { limit: "2", page: "2" } });
    expect(paged.body).toMatchObject({ total: 3, page: 2, pages: 2 });
    expect(paged.body.inventory.map((i: any) => i.id)).toEqual([F.inventory.hammockBlue]);
  });

  it("PATCH sets absolute quantity / applies delta, floors at 0, writes an InventoryLog row each time", async () => {
    await signInAs(F.admin.super);
    const logs = () => prisma.inventoryLog.findMany({ where: { inventoryId: F.inventory.hammockBlue }, orderBy: { createdAt: "asc" } });
    expect(await logs()).toHaveLength(1);

    const abs = await call(inventoryItemRoute.PATCH as H, "PATCH", I(F.inventory.hammockBlue), { params: { id: F.inventory.hammockBlue }, body: { quantity: 25 } });
    expect(abs.status, abs.text).toBe(200);
    expect(abs.body).toMatchObject({ id: F.inventory.hammockBlue, quantity: 25, variant: { product: { id: F.prod.hammock } } });
    const delta = await call(inventoryItemRoute.PATCH as H, "PATCH", I(F.inventory.hammockBlue), { params: { id: F.inventory.hammockBlue }, body: { delta: -5 } });
    expect(delta.body.quantity).toBe(20);
    const floor = await call(inventoryItemRoute.PATCH as H, "PATCH", I(F.inventory.hammockBlue), { params: { id: F.inventory.hammockBlue }, body: { delta: -100 } });
    expect(floor.body.quantity).toBe(0);
    const both = await call(inventoryItemRoute.PATCH as H, "PATCH", I(F.inventory.hammockBlue), { params: { id: F.inventory.hammockBlue }, body: { quantity: 3, delta: 50 } });
    expect(both.body.quantity).toBe(3);

    const rows = await logs();
    expect(rows.slice(1).map((l) => [l.delta, l.reason, l.note, l.tenantId])).toEqual([
      [15, "Manual adjustment", "Adjusted from 10 to 25", HOUSE],
      [-5, "Manual adjustment", "Adjusted from 25 to 20", HOUSE],
      [-20, "Manual adjustment", "Adjusted from 20 to 0", HOUSE],
      [3, "Manual adjustment", "Adjusted from 0 to 3", HOUSE],
    ]);
    const bad = await call(inventoryItemRoute.PATCH as H, "PATCH", I(F.inventory.hammockBlue), { params: { id: F.inventory.hammockBlue }, body: { quantity: "7" } });
    expect(bad.status).toBe(400);
    expect(await logs()).toHaveLength(5);

    // Read back through the list.
    const list = await call(inventoryRoute.GET as H, "GET", "/api/admin/inventory", { query: { search: "HAM-001-BLU" } });
    expect(list.body.inventory[0].quantity).toBe(3);
  });

  it("MCP inventory_list returns seeded stock; inventory_adjust preview/confirm/replay writes one log", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const list = await mcp.call("inventory_list", { lowStock: true });
      expect(list.inventory.map((i: any) => [i.id, i.quantity])).toEqual([[F.inventory.hammockRed, 2]]);
      const all = await mcp.call("inventory_list", {});
      expect(all.total).toBe(3);

      const logsBefore = await prisma.inventoryLog.count({ where: { inventoryId: F.inventory.hammockRed } });
      const flow = await previewConfirmReplay(mcp, "inventory_adjust", { inventoryId: F.inventory.hammockRed, delta: 8 }, async (preview) => {
        expect((await prisma.inventory.findUnique({ where: { id: F.inventory.hammockRed } }))!.quantity).toBe(2);
        expect(await prisma.inventoryLog.count({ where: { inventoryId: F.inventory.hammockRed } })).toBe(logsBefore);
        expect(preview.preview).toMatchObject({ quantity: { from: 2, to: 10 }, delta: 8, variant: { id: F.variant.hammockRed } });
      });
      expect(expectConfirmed(flow)).toMatchObject({ id: F.inventory.hammockRed, quantity: 10 });
      expectReplayBlocked(flow);
      const logs = await prisma.inventoryLog.findMany({ where: { inventoryId: F.inventory.hammockRed } });
      expect(logs).toHaveLength(logsBefore + 1);
      expect(logs[logs.length - 1]).toMatchObject({ delta: 8, reason: "Manual adjustment", note: "Adjusted from 2 to 10" });
      const after = await mcp.call("inventory_list", { search: "HAM-001-RED" });
      expect(after.inventory[0].quantity).toBe(10);

      expect(await mcp.call("inventory_adjust", { inventoryId: F.inventory.other, quantity: 0 })).toMatchObject({ blocked: true, status: 404 });
      expect(await mcp.call("inventory_adjust", { inventoryId: F.inventory.hammockRed })).toMatchObject({ blocked: true, status: 400 });
      expect((await prisma.inventory.findUnique({ where: { id: F.inventory.other } }))!.quantity).toBe(7);
    });
  });
});
