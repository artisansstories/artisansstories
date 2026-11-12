/* eslint-disable @typescript-eslint/no-explicit-any -- JSON payloads from routes/MCP */
/**
 * Catalog e2e — products: /api/admin/products/** routes and the products_* MCP
 * tools, against the seeded local database. Every write is read back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import * as productsRoute from "@/app/api/admin/products/route";
import * as productRoute from "@/app/api/admin/products/[id]/route";
import * as addonsRoute from "@/app/api/admin/products/[id]/addons/route";
import * as skuRoute from "@/app/api/admin/products/generate-sku/route";

// Product SKUs are random; tests can queue exact candidates to force a collision.
const skuQueue: string[] = [];
vi.mock("@/lib/sku", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/sku")>();
  return {
    ...real,
    generateProductSKU: (categoryName?: string | null) => skuQueue.shift() ?? real.generateProductSKU(categoryName),
  };
});
beforeEach(() => {
  skuQueue.length = 0;
});

type H = never;
const P = (id: string) => `/api/admin/products/${id}`;

/** Everything a product PUT can touch, in a stable order (timestamps included). */
async function productState(id: string) {
  const p = await prisma.product.findUnique({
    where: { id },
    include: {
      options: { orderBy: { position: "asc" } },
      variants: { orderBy: { id: "asc" }, include: { inventory: true } },
      images: { orderBy: { id: "asc" } },
      categories: { orderBy: { categoryId: "asc" } },
      artisans: { orderBy: { artisanId: "asc" } },
      addons: true,
    },
  });
  return JSON.parse(JSON.stringify(p));
}

async function withMcp<T>(key: string, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const mcp = await connectMcp(key);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}

/** A full PUT body: new options, one kept + one new variant (red dropped), images with variantId, categories, artisan. */
function fullUpdateBody() {
  return {
    name: "Woven Hammock XL",
    price: 13000,
    artisanId: F.artisan.jose,
    categoryIds: [F.cat.pottery, F.cat.empty],
    options: [
      { name: "Color", values: ["Blue", "Green"], position: 0 },
      { name: "Size", values: ["L"], position: 1 },
    ],
    variants: [
      { id: F.variant.hammockBlue, name: "Blue / L", sku: "HAM-001-BLU-L", price: 13500, quantity: 7, optionValues: { Color: "Blue", Size: "L" }, position: 0 },
      { name: "Green / L", sku: "HAM-001-GRN-L", quantity: 4, optionValues: { Color: "Green", Size: "L" }, position: 1 },
    ],
    images: [
      { url: "https://cdn.example.test/xl-main.webp", isDefault: true },
      { url: "https://cdn.example.test/xl-blue.webp", variantId: F.variant.hammockBlue, altText: "Blue XL" },
    ],
  };
}

/** Asserts the hammock now matches fullUpdateBody(), from a products_get / GET payload. */
function expectFullUpdateApplied(product: any) {
  expect(product.name).toBe("Woven Hammock XL");
  expect(product.slug).toBe("woven-hammock-xl");
  expect(product.price).toBe(13000);
  expect(product.artisanName).toBe("Jose Martinez");
  expect(product.categories.map((c: any) => c.category.id).sort()).toEqual([F.cat.empty, F.cat.pottery].sort());
  expect(product.options.map((o: any) => [o.name, o.values])).toEqual([["Color", ["Blue", "Green"]], ["Size", ["L"]]]);
  expect(product.variants).toHaveLength(2);
  const [blue, green] = product.variants;
  expect(blue).toMatchObject({ id: F.variant.hammockBlue, name: "Blue / L", sku: "HAM-001-BLU-L", price: 13500, optionValues: { Color: "Blue", Size: "L" } });
  expect(blue.inventory).toMatchObject({ id: F.inventory.hammockBlue, quantity: 7 });
  expect(green).toMatchObject({ name: "Green / L", sku: "HAM-001-GRN-L", price: null });
  expect(green.inventory).toMatchObject({ quantity: 4, reservedQuantity: 0 });
  expect(product.variants.some((v: any) => v.id === F.variant.hammockRed)).toBe(false);
  expect(product.images.map((i: any) => [i.url, i.isDefault, i.variantId])).toEqual([
    ["https://cdn.example.test/xl-main.webp", true, null],
    ["https://cdn.example.test/xl-blue.webp", false, F.variant.hammockBlue],
  ]);
  expect(blue.images.map((i: any) => i.url)).toEqual(["https://cdn.example.test/xl-blue.webp"]);
}

async function expectFullUpdateSideEffects() {
  expect(await prisma.productArtisan.findMany({ where: { productId: F.prod.hammock }, select: { artisanId: true } })).toEqual([{ artisanId: F.artisan.jose }]);
  // The dropped red variant and its inventory are gone; past order lines keep their row but lose the link.
  expect(await prisma.productVariant.findUnique({ where: { id: F.variant.hammockRed } })).toBeNull();
  expect(await prisma.inventory.findUnique({ where: { id: F.inventory.hammockRed } })).toBeNull();
  const oi = await prisma.orderItem.findUnique({ where: { id: F.orderItem.paidCancelHammock } });
  expect(oi).toMatchObject({ variantId: null, productId: F.prod.hammock, title: "Woven Hammock" });
}

// ── auth ─────────────────────────────────────────────────────────────────────

describe("products routes: auth and bad ids", () => {
  it("every route + method is 401 without a session", async () => {
    const results = await Promise.all([
      call(productsRoute.GET as H, "GET", "/api/admin/products"),
      call(productsRoute.POST as H, "POST", "/api/admin/products", { body: { name: "X", price: 1 } }),
      call(productRoute.GET as H, "GET", P(F.prod.hammock), { params: { id: F.prod.hammock } }),
      call(productRoute.PUT as H, "PUT", P(F.prod.hammock), { params: { id: F.prod.hammock }, body: { name: "Hacked" } }),
      call(productRoute.DELETE as H, "DELETE", P(F.prod.hammock), { params: { id: F.prod.hammock } }),
      call(addonsRoute.GET as H, "GET", `${P(F.prod.hammock)}/addons`, { params: { id: F.prod.hammock } }),
      call(addonsRoute.PUT as H, "PUT", `${P(F.prod.hammock)}/addons`, { params: { id: F.prod.hammock }, body: { type: "LASER_MONOGRAM", isEnabled: false } }),
      call(skuRoute.POST as H, "POST", "/api/admin/products/generate-sku", { body: { type: "product" } }),
    ]);
    for (const r of results) expect(r.status, r.text).toBe(401);
    // Nothing changed.
    expect(await prisma.product.findUnique({ where: { id: F.prod.hammock } })).toMatchObject({ name: "Woven Hammock" });
    expect(await prisma.productAddon.findUnique({ where: { id: F.addon.hammockMonogram } })).toMatchObject({ isEnabled: true });
    expect(await prisma.product.count({ where: { tenantId: HOUSE } })).toBe(3);
  });

  it("unknown and other-tenant ids are 404, not 500", async () => {
    await signInAs(F.admin.super);
    for (const id of ["does-not-exist", F.prod.other]) {
      const get = await call(productRoute.GET as H, "GET", P(id), { params: { id } });
      expect(get.status, get.text).toBe(404);
      expect(get.body).toEqual({ error: "Product not found" });
      const put = await call(productRoute.PUT as H, "PUT", P(id), { params: { id }, body: { name: "Nope" } });
      expect(put.status, put.text).toBe(404);
      const del = await call(productRoute.DELETE as H, "DELETE", P(id), { params: { id } });
      expect(del.status, del.text).toBe(404);
      const ag = await call(addonsRoute.GET as H, "GET", `${P(id)}/addons`, { params: { id } });
      expect(ag.status, ag.text).toBe(404);
      const ap = await call(addonsRoute.PUT as H, "PUT", `${P(id)}/addons`, { params: { id }, body: { type: "LASER_MONOGRAM", isEnabled: true } });
      expect(ap.status, ap.text).toBe(404);
    }
    // PUT with an unparseable body on a missing product is still 404.
    const bad = await call(productRoute.PUT as H, "PUT", P("does-not-exist"), { params: { id: "does-not-exist" }, body: "{not json" });
    expect(bad.status).toBe(404);
    // The other store's product is untouched.
    expect(await prisma.product.findUnique({ where: { id: F.prod.other } })).toMatchObject({ name: "Baseball Glove", tenantId: OTHER });
    expect(await prisma.productAddon.count({ where: { productId: F.prod.other } })).toBe(0);
  });
});

// ── list / get ───────────────────────────────────────────────────────────────

describe("products list/get", () => {
  it("GET /api/admin/products lists this store only, with filters and stats", async () => {
    await signInAs(F.admin.super);
    const all = await call(productsRoute.GET as H, "GET", "/api/admin/products");
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    expect(all.body.products.map((p: any) => p.slug)).toEqual(["clay-mug", "draft-basket", "hammock"]);
    const hammock = all.body.products.find((p: any) => p.id === F.prod.hammock);
    expect(hammock).toMatchObject({
      name: "Woven Hammock", status: "ACTIVE", price: 12000, artisanName: "Maria Hernandez",
      variantCount: 2, totalInventory: 12, thumbnail: { url: "https://cdn.example.test/hammock.webp" },
      categories: [{ id: F.cat.textiles, name: expect.any(String), slug: expect.any(String) }],
    });
    const mug = all.body.products.find((p: any) => p.id === F.prod.mug);
    expect(mug).toMatchObject({ variantCount: 1, totalInventory: 0, thumbnail: null });

    const draft = await call(productsRoute.GET as H, "GET", "/api/admin/products", { query: { status: "DRAFT" } });
    expect(draft.body.products.map((p: any) => p.id)).toEqual([F.prod.draft]);
    const search = await call(productsRoute.GET as H, "GET", "/api/admin/products", { query: { search: "maria" } });
    expect(search.body.products.map((p: any) => p.id)).toEqual([F.prod.hammock]);
    const byCat = await call(productsRoute.GET as H, "GET", "/api/admin/products", { query: { categoryId: F.cat.pottery } });
    expect(byCat.body.products.map((p: any) => p.id)).toEqual([F.prod.mug]);
    const paged = await call(productsRoute.GET as H, "GET", "/api/admin/products", { query: { limit: "2", page: "2" } });
    expect(paged.body).toMatchObject({ total: 3, page: 2, totalPages: 2 });
    expect(paged.body.products.map((p: any) => p.id)).toEqual([F.prod.hammock]);
    const otherCat = await call(productsRoute.GET as H, "GET", "/api/admin/products", { query: { categoryId: F.cat.other } });
    expect(otherCat.body.total).toBe(0);
  });

  it("GET /api/admin/products/[id] returns the full product", async () => {
    await signInAs(F.admin.super);
    const r = await call(productRoute.GET as H, "GET", P(F.prod.hammock), { params: { id: F.prod.hammock } });
    expect(r.status).toBe(200);
    const p = r.body.product;
    expect(p).toMatchObject({ id: F.prod.hammock, sku: "HAM-001", price: 12000, costPrice: 4000 });
    expect(p.options).toEqual([expect.objectContaining({ id: "h_opt_color", name: "Color", values: ["Blue", "Red"] })]);
    expect(p.variants.map((v: any) => [v.id, v.inventory?.quantity])).toEqual([[F.variant.hammockBlue, 10], [F.variant.hammockRed, 2]]);
    expect(p.variants[1].images.map((i: any) => i.id)).toEqual(["h_pimg_2"]);
    expect(p.images.map((i: any) => i.id)).toEqual(["h_pimg_1", "h_pimg_2"]);
    expect(p.categories.map((c: any) => c.category.id)).toEqual([F.cat.textiles]);
  });

  it("MCP products_list / products_get return seeded data and isolate tenants", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      const list = await mcp.call("products_list", {});
      expect(list.total).toBe(3);
      expect(list.products.map((p: any) => p.id).sort()).toEqual([F.prod.draft, F.prod.hammock, F.prod.mug].sort());
      const active = await mcp.call("products_list", { status: "ACTIVE", search: "mug" });
      expect(active.products.map((p: any) => p.id)).toEqual([F.prod.mug]);
      const byCat = await mcp.call("products_list", { categoryId: F.cat.textiles });
      expect(byCat.products.map((p: any) => p.id)).toEqual([F.prod.hammock]);

      const got = await mcp.call("products_get", { productId: F.prod.hammock });
      expect(got.product).toMatchObject({ id: F.prod.hammock, name: "Woven Hammock", artisanName: "Maria Hernandez" });
      expect(got.product.variants.map((v: any) => v.inventory?.quantity)).toEqual([10, 2]);

      const other = await mcp.call("products_get", { productId: F.prod.other });
      expect(other).toMatchObject({ done: false, blocked: true, status: 404 });
      const missing = await mcp.call("products_get", { productId: "nope" });
      expect(missing).toMatchObject({ blocked: true, status: 404 });
    });
    await withMcp(KEYS.otherRead, async (mcp) => {
      const list = await mcp.call("products_list", {});
      expect(list.products.map((p: any) => p.id)).toEqual([F.prod.other]);
    });
  });

  it("a read-only MCP key cannot run product write tools", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      const names = await mcp.toolNames();
      expect(names).toContain("products_get");
      expect(names).not.toContain("products_update");
      const r = await mcp.raw("products_delete", { productId: F.prod.hammock });
      expect(JSON.stringify(r)).not.toContain('"done":true');
    });
    expect(await prisma.product.findUnique({ where: { id: F.prod.hammock } })).not.toBeNull();
  });
});

// ── create ───────────────────────────────────────────────────────────────────

describe("product create", () => {
  it("POST creates with artisan link, categories, images and a Default variant at 0", async () => {
    await signInAs(F.admin.super);
    const r = await call(productsRoute.POST as H, "POST", "/api/admin/products", {
      body: {
        name: "Woven Hammock", // slug collides with nothing ("woven-hammock"), name may repeat
        price: 9900,
        artisanId: F.artisan.maria,
        artisanName: "ignored when artisanId is set",
        categoryIds: [F.cat.textiles, F.cat.empty],
        images: [{ url: "https://cdn.example.test/a.webp" }, { url: "https://cdn.example.test/b.webp" }],
        tags: ["new"],
      },
    });
    expect(r.status, r.text).toBe(201);
    const id = r.body.product.id;
    expect(r.body.product).toMatchObject({ slug: "woven-hammock", status: "DRAFT", artisanName: "Maria Hernandez", originCountry: "El Salvador" });

    const got = await call(productRoute.GET as H, "GET", P(id), { params: { id } });
    expect(got.status).toBe(200);
    const p = got.body.product;
    expect(p.tenantId).toBe(HOUSE);
    expect(p.categories.map((c: any) => c.category.id).sort()).toEqual([F.cat.empty, F.cat.textiles].sort());
    expect(p.images.map((i: any) => [i.url, i.isDefault, i.position])).toEqual([
      ["https://cdn.example.test/a.webp", true, 0],
      ["https://cdn.example.test/b.webp", false, 1],
    ]);
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]).toMatchObject({ name: "Default", optionValues: {} });
    expect(p.variants[0].inventory).toMatchObject({ quantity: 0, tenantId: HOUSE });
    expect(await prisma.productArtisan.findMany({ where: { productId: id }, select: { artisanId: true, tenantId: true } })).toEqual([{ artisanId: F.artisan.maria, tenantId: HOUSE }]);

    // A second product with the same name gets a unique slug.
    const again = await call(productsRoute.POST as H, "POST", "/api/admin/products", { body: { name: "Woven Hammock", price: 1 } });
    expect(again.status).toBe(201);
    expect(again.body.product.slug).toBe("woven-hammock-1");
  });

  it("POST validation: missing name/price is 400; bad or other-tenant references create nothing", async () => {
    await signInAs(F.admin.super);
    const before = await prisma.product.count();
    const noName = await call(productsRoute.POST as H, "POST", "/api/admin/products", { body: { price: 100 } });
    expect(noName.status).toBe(400);
    expect(noName.body).toEqual({ error: "Name is required" });
    const noPrice = await call(productsRoute.POST as H, "POST", "/api/admin/products", { body: { name: "No price" } });
    expect(noPrice.status).toBe(400);
    for (const body of [
      { name: "Bad artisan", price: 1, artisanId: "nope" },
      { name: "Foreign artisan", price: 1, artisanId: F.artisan.other },
      { name: "Bad category", price: 1, categoryIds: ["nope"] },
      { name: "Foreign category", price: 1, categoryIds: [F.cat.other] },
    ]) {
      const r = await call(productsRoute.POST as H, "POST", "/api/admin/products", { body });
      expect(r.status, `${body.name}: ${r.text}`).toBeGreaterThanOrEqual(400);
      expect(r.status, `${body.name}: ${r.text}`).toBeLessThan(500);
    }
    expect(await prisma.product.count()).toBe(before);
    expect(await prisma.productCategory.count({ where: { categoryId: F.cat.other, tenantId: HOUSE } })).toBe(0);
  });

  it("MCP products_create: preview changes nothing, confirm creates + links artisan, replay blocked", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const args = { name: "Clay Vase", price: 4500, artisanId: F.artisan.jose, categoryIds: [F.cat.pottery], status: "ACTIVE", sku: "VASE-001" };
      const before = await prisma.product.count();
      const flow = await previewConfirmReplay(mcp, "products_create", args, async (preview) => {
        expect(await prisma.product.count()).toBe(before);
        expect(preview.preview).toMatchObject({
          slug: "clay-vase", status: "ACTIVE", publishesOnStorefront: true,
          artisan: { id: F.artisan.jose, name: "Jose Martinez" },
          categories: [{ id: F.cat.pottery, name: expect.any(String) }],
        });
      });
      const result = expectConfirmed(flow);
      expectReplayBlocked(flow);
      expect(await prisma.product.count()).toBe(before + 1);
      const id = result.product.id;

      const got = await mcp.call("products_get", { productId: id });
      expect(got.product).toMatchObject({ name: "Clay Vase", slug: "clay-vase", status: "ACTIVE", sku: "VASE-001", artisanName: "Jose Martinez", price: 4500 });
      expect(got.product.categories.map((c: any) => c.category.id)).toEqual([F.cat.pottery]);
      expect(got.product.variants[0].inventory.quantity).toBe(0);
      expect(await prisma.productArtisan.findMany({ where: { productId: id }, select: { artisanId: true } })).toEqual([{ artisanId: F.artisan.jose }]);

      // Bad references are refused at preview.
      const bad = await mcp.call("products_create", { name: "X", price: 1, artisanId: F.artisan.other });
      expect(bad).toMatchObject({ blocked: true, status: 404 });
      const badCat = await mcp.call("products_create", { name: "X", price: 1, categoryIds: ["nope"] });
      expect(badCat).toMatchObject({ blocked: true, status: 404 });
      expect(await prisma.product.count()).toBe(before + 1);
    });
  });
});

// ── update (the key bug) ─────────────────────────────────────────────────────

describe("product update", () => {
  it("PUT full update (options, variants incl. new with inventory, images with variantId, categories, artisan) applies and reads back", async () => {
    await signInAs(F.admin.super);
    const r = await call(productRoute.PUT as H, "PUT", P(F.prod.hammock), { params: { id: F.prod.hammock }, body: fullUpdateBody() });
    expect(r.status, r.text).toBe(200);
    expectFullUpdateApplied(r.body.product);
    const got = await call(productRoute.GET as H, "GET", P(F.prod.hammock), { params: { id: F.prod.hammock } });
    expectFullUpdateApplied(got.body.product);
    await expectFullUpdateSideEffects();
    // The list view agrees.
    const list = await call(productsRoute.GET as H, "GET", "/api/admin/products", { query: { search: "xl" } });
    expect(list.body.products[0]).toMatchObject({ id: F.prod.hammock, variantCount: 2, totalInventory: 11, artisanName: "Jose Martinez" });
  });

  it("PUT scalar fields + unlinking the artisan", async () => {
    await signInAs(F.admin.super);
    const r = await call(productRoute.PUT as H, "PUT", P(F.prod.hammock), {
      params: { id: F.prod.hammock },
      body: { artisanId: null, promoLabel: "Sale", promoTheme: "BOLD", status: "ARCHIVED", isFeatured: true, tags: ["a", "b"], compareAtPrice: 15000 },
    });
    expect(r.status, r.text).toBe(200);
    const got = await prisma.product.findUnique({ where: { id: F.prod.hammock } });
    expect(got).toMatchObject({ artisanName: null, promoLabel: "Sale", promoTheme: "BOLD", status: "ARCHIVED", isFeatured: true, tags: ["a", "b"], compareAtPrice: 15000, slug: "hammock" });
    expect(await prisma.productArtisan.count({ where: { productId: F.prod.hammock } })).toBe(0);
    // Untouched relations stay.
    expect(await prisma.productVariant.count({ where: { productId: F.prod.hammock } })).toBe(2);
    expect(await prisma.productImage.count({ where: { productId: F.prod.hammock } })).toBe(2);
    // Clearing the promo label clears its theme.
    await call(productRoute.PUT as H, "PUT", P(F.prod.hammock), { params: { id: F.prod.hammock }, body: { promoLabel: "" } });
    expect(await prisma.product.findUnique({ where: { id: F.prod.hammock } })).toMatchObject({ promoLabel: null, promoTheme: null });
  });

  const failingBodies: Array<[string, () => Record<string, unknown>]> = [
    ["a variant id that belongs to ANOTHER product", () => ({ ...fullUpdateBody(), variants: [...fullUpdateBody().variants, { id: F.variant.mug, name: "Stolen", quantity: 99, optionValues: {}, position: 2 }] })],
    ["a variant id from ANOTHER store", () => ({ ...fullUpdateBody(), variants: [...fullUpdateBody().variants, { id: F.variant.other, name: "Stolen", quantity: 99, optionValues: {}, position: 2 }] })],
    ["a categoryId that does not exist", () => ({ ...fullUpdateBody(), categoryIds: [F.cat.pottery, "cat_does_not_exist"] })],
    ["a categoryId from ANOTHER store", () => ({ ...fullUpdateBody(), categoryIds: [F.cat.other] })],
    ["an artisanId that does not exist", () => ({ ...fullUpdateBody(), artisanId: "artisan_nope" })],
    ["an artisanId from ANOTHER store", () => ({ ...fullUpdateBody(), artisanId: F.artisan.other })],
    // Fails deep inside the write (unique constraint on the new variant's SKU), after options/variants were already touched.
    ["a new variant SKU already used by another product", () => ({ ...fullUpdateBody(), variants: [...fullUpdateBody().variants, { name: "Dup", sku: "MUG-001-DEF", quantity: 1, optionValues: {}, position: 2 }] })],
  ];

  for (const [label, body] of failingBodies) {
    it(`PUT with ${label} fails and changes NOTHING (options, variants, inventory, images, categories, artisan)`, async () => {
      await signInAs(F.admin.super);
      const hammockBefore = await productState(F.prod.hammock);
      const mugBefore = await productState(F.prod.mug);
      const otherBefore = await productState(F.prod.other);
      const invLogs = await prisma.inventoryLog.count();
      const r = await call(productRoute.PUT as H, "PUT", P(F.prod.hammock), { params: { id: F.prod.hammock }, body: body() });
      expect(r.status, r.text).toBeGreaterThanOrEqual(400);
      expect(r.status, r.text).toBeLessThan(500); // a client mistake, reported as such
      expect(r.body.error).toEqual(expect.any(String));
      expect(await productState(F.prod.hammock)).toEqual(hammockBefore);
      expect(await productState(F.prod.mug)).toEqual(mugBefore);
      expect(await productState(F.prod.other)).toEqual(otherBefore);
      expect(await prisma.inventoryLog.count()).toBe(invLogs);
      expect(await prisma.productCategory.count({ where: { tenantId: HOUSE, categoryId: F.cat.other } })).toBe(0);
      expect(await prisma.productArtisan.count({ where: { tenantId: HOUSE, artisanId: F.artisan.other } })).toBe(0);
    });
  }

  it("MCP products_update full flow: preview changes nothing, confirm applies, replay blocked, read back", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await productState(F.prod.hammock);
      const args = { productId: F.prod.hammock, ...fullUpdateBody() };
      const flow = await previewConfirmReplay(mcp, "products_update", args, async (preview) => {
        expect(await productState(F.prod.hammock)).toEqual(before);
        const pv = preview.preview;
        expect(pv.changes.name).toEqual({ from: "Woven Hammock", to: "Woven Hammock XL" });
        expect(pv.changes.artisanName).toEqual({ from: "Maria Hernandez", to: "Jose Martinez" });
        expect(pv.variants.deleted.map((v: any) => v.id)).toEqual([F.variant.hammockRed]);
        expect(pv.variants.deleted[0].orderItemReferences).toBeGreaterThan(0);
        expect(pv.variants.created).toEqual([{ name: "Green / L", sku: "HAM-001-GRN-L", price: null, quantity: 4 }]);
        expect(pv.images).toMatchObject({ replacesAll: true, from: 2, to: 2 });
        expect(pv.categories.to.map((c: any) => c.id).sort()).toEqual([F.cat.empty, F.cat.pottery].sort());
      });
      const result = expectConfirmed(flow);
      expectReplayBlocked(flow);
      expectFullUpdateApplied(result.product);
      const got = await mcp.call("products_get", { productId: F.prod.hammock });
      expectFullUpdateApplied(got.product);
      await expectFullUpdateSideEffects();
    });
  });

  it("MCP products_update clearFields unlinks the artisan and nulls fields", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "products_update", { productId: F.prod.hammock, clearFields: ["artisanId", "costPrice", "sku"] }, async () => {
        expect(await prisma.productArtisan.count({ where: { productId: F.prod.hammock } })).toBe(1);
      });
      expectConfirmed(flow);
      expectReplayBlocked(flow);
      const got = await mcp.call("products_get", { productId: F.prod.hammock });
      expect(got.product).toMatchObject({ artisanName: null, costPrice: null, sku: null });
      expect(await prisma.productArtisan.count({ where: { productId: F.prod.hammock } })).toBe(0);
    });
  });

  it("MCP products_update with another product's variant id is refused at preview; nothing changes", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await productState(F.prod.hammock);
      const mugBefore = await productState(F.prod.mug);
      const r = await mcp.call("products_update", { productId: F.prod.hammock, ...failingBodies[0][1]() });
      expect(r).toMatchObject({ done: false, blocked: true, status: 400 });
      const r2 = await mcp.call("products_update", { productId: F.prod.hammock, ...failingBodies[2][1]() });
      expect(r2).toMatchObject({ done: false, blocked: true, status: 404 });
      expect(await productState(F.prod.hammock)).toEqual(before);
      expect(await productState(F.prod.mug)).toEqual(mugBefore);
    });
  });

  it("MCP products_update that fails at confirm (duplicate SKU) rolls back everything", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await productState(F.prod.hammock);
      const args = { productId: F.prod.hammock, ...failingBodies[6][1]() };
      const flow = await previewConfirmReplay(mcp, "products_update", args, async () => {
        expect(await productState(F.prod.hammock)).toEqual(before);
      });
      expect(flow.confirmed, JSON.stringify(flow.confirmed)).toMatchObject({ done: false, blocked: true, status: 409, outcome: "failed" });
      expectReplayBlocked(flow);
      expect(await productState(F.prod.hammock)).toEqual(before);
      const got = await mcp.call("products_get", { productId: F.prod.hammock });
      expect(got.product.variants.map((v: any) => v.id)).toEqual([F.variant.hammockBlue, F.variant.hammockRed]);
      expect(got.product.options.map((o: any) => o.values)).toEqual([["Blue", "Red"]]);
    });
  });

  it("MCP products_update whose category disappears between preview and confirm rolls back everything", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const before = await productState(F.prod.hammock);
      const args = { productId: F.prod.hammock, ...fullUpdateBody() };
      const flow = await previewConfirmReplay(mcp, "products_update", args, async () => {
        expect(await productState(F.prod.hammock)).toEqual(before);
        await prisma.category.delete({ where: { id: F.cat.empty } }); // assigned to nothing, so deletable
      });
      expect(flow.confirmed.done, JSON.stringify(flow.confirmed)).toBe(false);
      expect(flow.confirmed.blocked).toBe(true);
      expect(await productState(F.prod.hammock)).toEqual(before);
    });
  });
});

// ── delete ───────────────────────────────────────────────────────────────────

describe("product delete", () => {
  it("DELETE cascades variants, inventory (+logs), images, options, links and addons; order lines keep their snapshot", async () => {
    await signInAs(F.admin.super);
    const r = await call(productRoute.DELETE as H, "DELETE", P(F.prod.hammock), { params: { id: F.prod.hammock } });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toEqual({ success: true });
    const got = await call(productRoute.GET as H, "GET", P(F.prod.hammock), { params: { id: F.prod.hammock } });
    expect(got.status).toBe(404);
    const where = { productId: F.prod.hammock };
    expect(await prisma.productVariant.count({ where })).toBe(0);
    expect(await prisma.inventory.count({ where: { id: { in: [F.inventory.hammockBlue, F.inventory.hammockRed] } } })).toBe(0);
    expect(await prisma.inventoryLog.count({ where: { inventoryId: F.inventory.hammockBlue } })).toBe(0);
    expect(await prisma.productImage.count({ where })).toBe(0);
    expect(await prisma.productOption.count({ where })).toBe(0);
    expect(await prisma.productCategory.count({ where })).toBe(0);
    expect(await prisma.productArtisan.count({ where })).toBe(0);
    expect(await prisma.productAddon.count({ where })).toBe(0);
    const oi = await prisma.orderItem.findUnique({ where: { id: F.orderItem.paidHammock } });
    expect(oi).toMatchObject({ productId: null, variantId: null, title: "Woven Hammock", price: 12000 });
    // Category and artisan themselves remain.
    expect(await prisma.category.findUnique({ where: { id: F.cat.textiles } })).not.toBeNull();
    expect(await prisma.artisan.findUnique({ where: { id: F.artisan.maria } })).not.toBeNull();
    const list = await call(productsRoute.GET as H, "GET", "/api/admin/products");
    expect(list.body.total).toBe(2);
  });

  it("MCP products_delete: preview lists what goes and changes nothing; confirm deletes; replay blocked", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "products_delete", { productId: F.prod.hammock }, async (preview) => {
        expect(await prisma.product.findUnique({ where: { id: F.prod.hammock } })).not.toBeNull();
        expect(preview.preview).toMatchObject({
          wasLiveOnStorefront: true,
          permanentlyDeletes: { inventoryRecords: 2, images: 2, options: 1, categoryLinks: 1, artisanLinks: 1, addons: 1 },
        });
        expect(preview.preview.orderItemReferences).toBeGreaterThan(0);
      });
      expect(expectConfirmed(flow)).toEqual({ success: true });
      expectReplayBlocked(flow);
      expect(await mcp.call("products_get", { productId: F.prod.hammock })).toMatchObject({ blocked: true, status: 404 });
      expect(await prisma.productVariant.count({ where: { productId: F.prod.hammock } })).toBe(0);
      expect(await prisma.inventory.count({ where: { id: F.inventory.hammockBlue } })).toBe(0);
      // Other-tenant product cannot be targeted.
      expect(await mcp.call("products_delete", { productId: F.prod.other })).toMatchObject({ blocked: true, status: 404 });
      expect(await prisma.product.findUnique({ where: { id: F.prod.other } })).not.toBeNull();
    });
  });
});

// ── addons ───────────────────────────────────────────────────────────────────

describe("product addons", () => {
  it("GET/PUT addons route toggles and creates with the default config", async () => {
    await signInAs(F.admin.super);
    const path = `${P(F.prod.hammock)}/addons`;
    const g = await call(addonsRoute.GET as H, "GET", path, { params: { id: F.prod.hammock } });
    expect(g.status).toBe(200);
    expect(g.body.addons).toEqual([expect.objectContaining({ id: F.addon.hammockMonogram, type: "LASER_MONOGRAM", isEnabled: true })]);

    const off = await call(addonsRoute.PUT as H, "PUT", path, { params: { id: F.prod.hammock }, body: { type: "LASER_MONOGRAM", isEnabled: false } });
    expect(off.status).toBe(200);
    expect(off.body.addon).toMatchObject({ id: F.addon.hammockMonogram, isEnabled: false, config: { price: 1500 } });
    const g2 = await call(addonsRoute.GET as H, "GET", path, { params: { id: F.prod.hammock } });
    expect(g2.body.addons[0].isEnabled).toBe(false);

    const mugPath = `${P(F.prod.mug)}/addons`;
    const on = await call(addonsRoute.PUT as H, "PUT", mugPath, { params: { id: F.prod.mug }, body: { type: "LASER_MONOGRAM", isEnabled: true } });
    expect(on.status).toBe(200);
    const g3 = await call(addonsRoute.GET as H, "GET", mugPath, { params: { id: F.prod.mug } });
    expect(g3.body.addons).toEqual([expect.objectContaining({ type: "LASER_MONOGRAM", isEnabled: true, tenantId: HOUSE, config: expect.objectContaining({ maxChars: 50 }) })]);

    const badType = await call(addonsRoute.PUT as H, "PUT", mugPath, { params: { id: F.prod.mug }, body: { type: "ENGRAVING", isEnabled: true } });
    expect(badType.status).toBe(400);
    const missing = await call(addonsRoute.PUT as H, "PUT", mugPath, { params: { id: F.prod.mug }, body: { type: "LASER_MONOGRAM" } });
    expect(missing.status).toBe(400);
    expect(await prisma.productAddon.count({ where: { productId: F.prod.mug } })).toBe(1);
  });

  it("MCP products_addons_get / products_addons_set", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const g = await mcp.call("products_addons_get", { productId: F.prod.hammock });
      expect(g.addons.map((a: any) => [a.type, a.isEnabled])).toEqual([["LASER_MONOGRAM", true]]);
      expect(await mcp.call("products_addons_get", { productId: "nope" })).toMatchObject({ blocked: true, status: 404 });

      const flow = await previewConfirmReplay(mcp, "products_addons_set", { productId: F.prod.mug, type: "LASER_MONOGRAM", isEnabled: true }, async (preview) => {
        expect(await prisma.productAddon.count({ where: { productId: F.prod.mug } })).toBe(0);
        expect(preview.preview).toMatchObject({ exists: false, isEnabled: { from: null, to: true } });
      });
      expect(expectConfirmed(flow).addon).toMatchObject({ productId: F.prod.mug, isEnabled: true });
      expectReplayBlocked(flow);
      const after = await mcp.call("products_addons_get", { productId: F.prod.mug });
      expect(after.addons.map((a: any) => a.isEnabled)).toEqual([true]);

      const off = await previewConfirmReplay(mcp, "products_addons_set", { productId: F.prod.hammock, type: "LASER_MONOGRAM", isEnabled: false }, async () => {
        expect((await prisma.productAddon.findUnique({ where: { id: F.addon.hammockMonogram } }))!.isEnabled).toBe(true);
      });
      expectConfirmed(off);
      expectReplayBlocked(off);
      expect((await mcp.call("products_addons_get", { productId: F.prod.hammock })).addons[0].isEnabled).toBe(false);
    });
  });
});

// ── generate SKU ─────────────────────────────────────────────────────────────

describe("generate SKU", () => {
  it("product SKU: category prefix, and retries past an SKU this store already uses", async () => {
    await signInAs(F.admin.super);
    const r = await call(skuRoute.POST as H, "POST", "/api/admin/products/generate-sku", { body: { type: "product", categoryName: "Textiles" } });
    expect(r.status).toBe(200);
    expect(r.body.sku).toMatch(/^AS-TEXT-[A-Z0-9]{6}$/);

    skuQueue.push("HAM-001", "AS-PRD-FRESH1"); // first candidate is taken by the hammock
    const retry = await call(skuRoute.POST as H, "POST", "/api/admin/products/generate-sku", { body: { type: "product" } });
    expect(retry.body).toEqual({ sku: "AS-PRD-FRESH1" });
    // Another store's SKU does not count as taken.
    skuQueue.push("GLV-001");
    const foreign = await call(skuRoute.POST as H, "POST", "/api/admin/products/generate-sku", { body: { type: "product" } });
    expect(foreign.body).toEqual({ sku: "GLV-001" });
    // Nothing is saved.
    expect(await prisma.product.count({ where: { sku: "AS-PRD-FRESH1" } })).toBe(0);
  });

  it("variant SKU: deterministic suffix, unique even when the obvious one is taken", async () => {
    await signInAs(F.admin.super);
    const fresh = await call(skuRoute.POST as H, "POST", "/api/admin/products/generate-sku", { body: { type: "variant", productSku: "HAM-001", optionValues: ["Green"] } });
    expect(fresh.status).toBe(200);
    expect(fresh.body.sku).toBe("HAM-001-GRE");
    const taken = await call(skuRoute.POST as H, "POST", "/api/admin/products/generate-sku", { body: { type: "variant", productSku: "HAM-001", optionValues: ["Blue"] } });
    expect(taken.status, taken.text).toBe(200);
    expect(taken.body.sku).toMatch(/^HAM-001-BLU-/);
    expect(await prisma.productVariant.count({ where: { tenantId: HOUSE, sku: taken.body.sku } })).toBe(0);

    const noParent = await call(skuRoute.POST as H, "POST", "/api/admin/products/generate-sku", { body: { type: "variant" } });
    expect(noParent.status).toBe(400);
    const badType = await call(skuRoute.POST as H, "POST", "/api/admin/products/generate-sku", { body: { type: "nope" } });
    expect(badType.status).toBe(400);
    const noBody = await call(skuRoute.POST as H, "POST", "/api/admin/products/generate-sku", { body: "" });
    expect(noBody.status).toBe(400);
  });

  it("MCP products_generate_sku", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      const p = await mcp.call("products_generate_sku", { type: "product", categoryName: "Pottery" });
      expect(p.sku).toMatch(/^AS-POTT-/);
      skuQueue.push("MUG-001", "AS-PRD-OK0001");
      expect(await mcp.call("products_generate_sku", { type: "product" })).toEqual({ sku: "AS-PRD-OK0001" });
      const v = await mcp.call("products_generate_sku", { type: "variant", productSku: "HAM-001", optionValues: ["Red"] });
      expect(v.sku).toMatch(/^HAM-001-RED-/);
      expect(await mcp.call("products_generate_sku", { type: "variant" })).toMatchObject({ blocked: true, status: 400 });
    });
  });
});
