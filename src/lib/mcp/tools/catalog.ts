/**
 * Catalog — mirrors /api/admin/products/*, /api/admin/categories/*,
 * /api/admin/inventory/* and /api/admin/upload via src/lib/admin-services/*.
 */
import { z } from "zod";
import { readTool, writeTool, zId, zPage, zLimit, zCents, type McpTool } from "../kit";
import { fetchRemoteImage, assertPublicHttpsUrl } from "../fetch-image";
import * as products from "@/lib/admin-services/products";
import * as categories from "@/lib/admin-services/categories";
import * as inventory from "@/lib/admin-services/inventory";
import { processProductImage, previewRegenerateAltText, regenerateProductAltText } from "@/lib/admin-services/uploads";
import { fail } from "@/lib/admin-services/result";

const PRODUCT_STATUS = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
const DISCOUNT_TYPE = ["PERCENTAGE", "FIXED"] as const;
const PROMO_THEME = ["WARM", "COOL", "BOLD", "SOFT", "DARK"] as const;

/** Product fields that can be explicitly cleared (set to null) on update. */
const CLEARABLE = [
  "description",
  "story",
  "compareAtPrice",
  "discountType",
  "promoLabel",
  "promoTheme",
  "costPrice",
  "sku",
  "artisanId",
  "disclaimer",
  "seoTitle",
  "seoDescription",
  "weight",
  "length",
  "width",
  "height",
] as const;

const zImage = z.object({
  url: z.string().describe("Full-size image URL (from products_upload_image)"),
  urlMedium: z.string().nullish().describe("Medium (800px) URL"),
  urlThumb: z.string().nullish().describe("Thumbnail (300px) URL"),
  altText: z.string().nullish().describe("Alt text"),
  position: z.number().int().min(0).nullish().describe("Sort position (default: array index)"),
  isDefault: z.boolean().nullish().describe("Primary image (default: first image)"),
});

/** Fields shared by create and update. */
const productFields = {
  description: z.string().nullish().describe("Product description"),
  story: z.string().nullish().describe("Artisan story text"),
  compareAtPrice: z.number().int().min(0).nullish().describe("Original price shown struck through (in cents)"),
  discountType: z.enum(DISCOUNT_TYPE).nullish().describe("How the compare-at discount is displayed"),
  promoLabel: z.string().nullish().describe("Promo badge text; an empty string removes the badge and its theme"),
  promoTheme: z.enum(PROMO_THEME).nullish().describe("Promo badge color theme (default WARM when a label is set)"),
  costPrice: z.number().int().min(0).nullish().describe("Unit cost (in cents)"),
  status: z
    .enum(PRODUCT_STATUS)
    .nullish()
    .describe("DRAFT (hidden), ACTIVE (published on the storefront), ARCHIVED (hidden)"),
  categoryIds: z.array(z.string()).nullish().describe("Category ids (from categories_list); on update replaces all links"),
  tags: z.array(z.string()).nullish().describe("Tags; on update replaces the list"),
  artisanName: z.string().nullish().describe("Free-text artisan name (create only; overwritten when artisanId is set)"),
  artisanId: z.string().nullish().describe("Artisan id to link; sets artisanName from the artisan record"),
  originCountry: z.string().nullish().describe("Country of origin (create default: El Salvador)"),
  materialsUsed: z.array(z.string()).nullish().describe("Materials; on update replaces the list"),
  requiresShipping: z.boolean().nullish().describe("Physical item that ships (create default: true)"),
  weight: z.number().min(0).nullish().describe("Weight, in weightUnit"),
  weightUnit: z.string().nullish().describe("Weight unit, e.g. oz, lb, g, kg (create default: oz)"),
  length: z.number().min(0).nullish().describe("Length, in dimensionUnit"),
  width: z.number().min(0).nullish().describe("Width, in dimensionUnit"),
  height: z.number().min(0).nullish().describe("Height, in dimensionUnit"),
  dimensionUnit: z.string().nullish().describe("Dimension unit, e.g. in or cm (create default: in)"),
  sku: z.string().nullish().describe("Product SKU (unique per store; see products_generate_sku)"),
  seoTitle: z.string().nullish().describe("SEO title"),
  seoDescription: z.string().nullish().describe("SEO meta description"),
  showcaseImages: z.array(z.string()).nullish().describe("Showcase image URLs; on update replaces the list"),
};

export const tools: McpTool[] = [
  // ── products ──────────────────────────────────────────────────────────────
  readTool({
    name: "products_list",
    title: "List products",
    description:
      "List products sorted by slug, with optional search (name, slug, artisan name), status and category filters. Returns id, slug, name, status, price and compareAtPrice (cents), featured flag, artisan, categories, thumbnail, variant count and total inventory.",
    input: {
      search: z.string().nullish().describe("Matches name, slug or artisan name (case-insensitive)"),
      status: z.enum(PRODUCT_STATUS).nullish().describe("Status filter"),
      categoryId: z.string().nullish().describe("Only products in this category"),
      page: zPage,
      limit: zLimit(100, 20),
    },
    run: (ctx, a) => products.listProducts(ctx.db, a),
  }),

  readTool({
    name: "products_get",
    title: "Get product",
    description:
      "Get one product with categories, images, options, and variants (each with inventory and variant images). Prices are in cents.",
    input: { productId: zId("Product") },
    run: (ctx, a) => products.getProduct(ctx.db, a.productId),
  }),

  writeTool({
    name: "products_create",
    title: "Create product",
    kind: "sensitive",
    description:
      "Create a product with a single 'Default' variant at inventory 0. Status defaults to DRAFT (not visible); creating with status ACTIVE publishes it on the storefront immediately. The slug is generated from the name. Upload images first with products_upload_image and pass their URLs. Add variants/options afterwards with products_update.",
    input: {
      name: z.string().min(1).describe("Product name"),
      price: zCents("Price"),
      ...productFields,
      images: z.array(zImage).nullish().describe("Product images; the first is the default unless isDefault is set"),
    },
    preview: (ctx, a) => products.previewCreateProduct(ctx.db, a),
    execute: (ctx, a) => products.createProduct(ctx.db, a),
  }),

  writeTool({
    name: "products_update",
    title: "Update product",
    kind: "sensitive",
    destructive: true,
    description:
      "Update a product. Only fields you pass change. Setting status to ACTIVE publishes it on the storefront. List fields (categoryIds, tags, materialsUsed, showcaseImages) and the nested images, options and variants arrays REPLACE the existing set entirely: passing variants deletes every existing variant whose id is not included (and sets inventory to each variant's quantity, default 0); passing images replaces all images. Read the product with products_get first and send complete arrays. To attach an uploaded image, pass the full images array including the new URLs. Use clearFields to set nullable fields to empty. The preview shows a field-by-field before/after diff and which variants/images would be deleted.",
    input: {
      productId: zId("Product"),
      name: z.string().min(1).nullish().describe("New name (also regenerates the slug)"),
      price: z.number().int().min(0).nullish().describe("Price (in cents)"),
      isFeatured: z.boolean().nullish().describe("Feature on the storefront"),
      disclaimer: z
        .string()
        .nullish()
        .describe("Per-product disclaimer text; empty string shows no disclaimer. Clear via clearFields to use the store-wide default"),
      ...productFields,
      clearFields: z
        .array(z.enum(CLEARABLE))
        .nullish()
        .describe("Fields to set to null. artisanId unlinks the artisan; promoLabel also clears promoTheme; disclaimer reverts to the store default"),
      images: z
        .array(
          zImage.extend({
            variantId: z.string().nullish().describe("Variant this image belongs to (existing variant id of this product)"),
          }),
        )
        .nullish()
        .describe("Complete replacement image list"),
      options: z
        .array(
          z.object({
            name: z.string().describe("Option name, e.g. Size"),
            values: z.array(z.string()).describe("Option values, e.g. [\"S\",\"M\",\"L\"]"),
            position: z.number().int().min(0).nullish().describe("Sort position (default: array index)"),
          }),
        )
        .nullish()
        .describe("Complete replacement option list (existing options are deleted and re-created)"),
      variants: z
        .array(
          z.object({
            id: z.string().nullish().describe("Existing variant id to keep/update; omit to create a new variant"),
            name: z.string().describe("Variant name, e.g. \"Small / Red\""),
            sku: z.string().nullish().describe("Variant SKU"),
            price: z.number().int().min(0).nullish().describe("Variant price override (in cents); omit to use the product price"),
            quantity: z.number().int().min(0).nullish().describe("Inventory quantity to set (default 0)"),
            optionValues: z.record(z.string(), z.string()).describe("Option name → value, e.g. {\"Size\":\"S\"}"),
            position: z.number().int().min(0).describe("Sort position"),
          }),
        )
        .nullish()
        .describe("Complete variant list. Variants of this product not listed by id are DELETED"),
    },
    preview: (ctx, { productId, ...a }) => products.previewUpdateProduct(ctx.db, productId, toUpdateBody(a)),
    execute: (ctx, { productId, ...a }) => products.updateProduct(ctx.db, productId, toUpdateBody(a)),
  }),

  writeTool({
    name: "products_delete",
    title: "Delete product",
    kind: "sensitive",
    destructive: true,
    idempotent: true,
    description:
      "Permanently delete a product with its variants, inventory, images, options, category/artisan links, reviews and add-ons. Past order line items keep their snapshot but lose the product link. The preview lists everything that would be removed. Archiving (products_update status ARCHIVED) hides a product without deleting it.",
    input: { productId: zId("Product") },
    preview: (ctx, a) => products.previewDeleteProduct(ctx.db, a.productId),
    execute: (ctx, a) => products.deleteProduct(ctx.db, a.productId),
  }),

  readTool({
    name: "products_addons_get",
    title: "Get product add-ons",
    description: "List a product's add-ons (e.g. LASER_MONOGRAM) with enabled flag and config.",
    input: { productId: zId("Product") },
    run: (ctx, a) => products.getProductAddons(ctx.db, a.productId),
  }),

  writeTool({
    name: "products_addons_set",
    title: "Enable/disable product add-on",
    kind: "write",
    idempotent: true,
    description:
      "Enable or disable the laser monogram add-on for a product. Creates it with the default config (fonts, 50 chars, INITIALS/FULL_NAME styles) if it doesn't exist.",
    input: {
      productId: zId("Product"),
      type: z.enum(["LASER_MONOGRAM"]).describe("Add-on type"),
      isEnabled: z.boolean().describe("Whether customers can add it"),
    },
    preview: (ctx, a) => products.previewSetProductAddon(ctx.db, a.productId, a.type, a.isEnabled),
    execute: (ctx, a) => products.setProductAddon(ctx.db, a.productId, a.type, a.isEnabled),
  }),

  readTool({
    name: "products_generate_sku",
    title: "Generate SKU",
    description:
      "Generate an unused SKU. type=product gives AS-{CATEGORY PREFIX}-{6 random}; type=variant gives {productSku}-{option suffixes}. Only computes a value; nothing is saved (set it with products_update).",
    input: {
      type: z.enum(["product", "variant"]).describe("Which kind of SKU"),
      categoryName: z.string().nullish().describe("Category name for the product prefix (default PRD)"),
      productSku: z.string().nullish().describe("Parent product SKU (required for type=variant)"),
      optionValues: z.array(z.string()).nullish().describe("Variant option values, e.g. [\"Small\",\"Red\"]"),
    },
    run: (ctx, a) => products.generateSku(ctx.db, a),
  }),

  writeTool({
    name: "products_upload_image",
    title: "Upload product image",
    kind: "write",
    openWorld: true,
    description:
      "Download an image from a public https URL (JPEG, PNG, WebP or HEIC, max 10MB), convert it to WebP in full/medium/thumbnail sizes, store it in the store's image bucket, and generate alt text. Returns url, urlMedium, urlThumb, dimensions and altText. This does NOT attach the image to a product; do that with products_update (images array).",
    input: {
      imageUrl: z.string().url().describe("Public https URL of the image"),
      productName: z.string().nullish().describe("Product name, used as alt-text context"),
      artisanName: z.string().nullish().describe("Artisan name, used as alt-text context"),
      variantHint: z.string().nullish().describe("Variant description, used as alt-text context"),
      position: z.number().int().min(1).nullish().describe("1-based image position on the product, used in the fallback alt text when the AI is unavailable"),
    },
    preview: async (_ctx, a) => {
      try {
        await assertPublicHttpsUrl(a.imageUrl);
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : "Invalid image URL");
      }
      return {
        action: "download and store image",
        imageUrl: a.imageUrl,
        stores: "3 WebP files (full ≤2000px, medium 800px, thumb 300px) in the store's image bucket",
        attachesToProduct: false,
        altTextContext: { productName: a.productName ?? null, artisanName: a.artisanName ?? null, variantHint: a.variantHint ?? null },
      };
    },
    execute: async (ctx, a) => {
      const fetched = await fetchRemoteImage(a.imageUrl);
      if (!fetched.ok) return fail(400, fetched.error);
      return processProductImage({
        ...fetched.image,
        tenantId: ctx.tenantId,
        productName: a.productName,
        artisanName: a.artisanName,
        variantHint: a.variantHint,
        position: a.position,
      });
    },
  }),

  writeTool({
    name: "products_regenerate_alt_text",
    title: "Regenerate product image alt text",
    kind: "write",
    idempotent: true,
    description:
      "Ask the AI again for alt text on a product's images that only have the automatic fallback (\"<product name> — image <n>\"), or on every image with all=true. Images the AI can't describe keep their current text. Never fails because the AI is unavailable.",
    input: {
      productId: zId("Product"),
      all: z.boolean().nullish().describe("Redo every image, not just fallback ones (default false)"),
    },
    preview: (ctx, a) => previewRegenerateAltText(ctx.db, a.productId, a.all ?? false),
    execute: (ctx, a) => regenerateProductAltText(ctx.db, a.productId, a.all ?? false),
  }),

  // ── categories ────────────────────────────────────────────────────────────
  readTool({
    name: "categories_list",
    title: "List categories",
    description: "List all categories by position with parent, children, and product count.",
    input: {},
    run: (ctx) => categories.listCategories(ctx.db),
  }),

  readTool({
    name: "categories_get",
    title: "Get category",
    description: "Get one category with parent, children (with product counts), and its products (id, name, slug, status, price in cents).",
    input: { categoryId: zId("Category") },
    run: (ctx, a) => categories.getCategory(ctx.db, a.categoryId),
  }),

  writeTool({
    name: "categories_create",
    title: "Create category",
    kind: "write",
    description:
      "Create a category. The slug is generated from the name; position defaults to after the last category; isActive defaults to true (shown on the storefront).",
    input: {
      name: z.string().min(1).describe("Category name"),
      description: z.string().nullish().describe("Description"),
      parentId: z.string().nullish().describe("Parent category id for a subcategory"),
      imageUrl: z.string().nullish().describe("Category image URL"),
      isActive: z.boolean().nullish().describe("Shown on the storefront (default true)"),
      position: z.number().int().nullish().describe("Sort position"),
    },
    preview: (ctx, a) => categories.previewCreateCategory(ctx.db, a),
    execute: (ctx, a) => categories.createCategory(ctx.db, a),
  }),

  writeTool({
    name: "categories_update",
    title: "Update category",
    kind: "write",
    idempotent: true,
    description:
      "Update a category. Only fields you pass change; a new name regenerates the slug. Use makeTopLevel to remove the parent.",
    input: {
      categoryId: zId("Category"),
      name: z.string().min(1).nullish().describe("New name"),
      description: z.string().nullish().describe("Description"),
      parentId: z.string().nullish().describe("New parent category id"),
      makeTopLevel: z.boolean().nullish().describe("Remove the parent (ignored if parentId is given)"),
      imageUrl: z.string().nullish().describe("Category image URL"),
      isActive: z.boolean().nullish().describe("Shown on the storefront"),
      position: z.number().int().nullish().describe("Sort position"),
    },
    preview: (ctx, { categoryId, makeTopLevel, ...a }) =>
      categories.previewUpdateCategory(ctx.db, categoryId, makeTopLevel && a.parentId === undefined ? { ...a, parentId: null } : a),
    execute: (ctx, { categoryId, makeTopLevel, ...a }) =>
      categories.updateCategory(ctx.db, categoryId, makeTopLevel && a.parentId === undefined ? { ...a, parentId: null } : a),
  }),

  writeTool({
    name: "categories_delete",
    title: "Delete category",
    kind: "sensitive",
    destructive: true,
    idempotent: true,
    description:
      "Permanently delete a category. Refused while any product is assigned to it. Child categories become top-level.",
    input: { categoryId: zId("Category") },
    preview: (ctx, a) => categories.previewDeleteCategory(ctx.db, a.categoryId),
    execute: (ctx, a) => categories.deleteCategory(ctx.db, a.categoryId),
  }),

  // ── inventory ─────────────────────────────────────────────────────────────
  readTool({
    name: "inventory_list",
    title: "List inventory",
    description:
      "List inventory records (one per variant), lowest quantity first, with variant and product. Optional low-stock filter (0 < quantity ≤ lowStockThreshold) and search over product name, product/variant SKU and variant name. Use the inventory record id with inventory_adjust.",
    input: {
      lowStock: z.boolean().nullish().describe("Only low-stock items"),
      search: z.string().nullish().describe("Product name, SKU, or variant name (case-insensitive)"),
      page: zPage,
      limit: zLimit(100, 50),
    },
    run: (ctx, a) => inventory.listInventory(ctx.db, a),
  }),

  writeTool({
    name: "inventory_adjust",
    title: "Adjust inventory",
    kind: "write",
    description:
      "Set a variant's stock to an absolute quantity, or change it by a delta. Quantity is floored at 0. Writes an inventory log entry ('Manual adjustment'). If both are given, quantity wins. The preview shows current → new quantity.",
    input: {
      inventoryId: z.string().min(1).describe("Inventory record id (from inventory_list, or variants[].inventory.id in products_get)"),
      quantity: z.number().int().nullish().describe("New absolute quantity"),
      delta: z.number().int().nullish().describe("Change to apply, e.g. -2 or 10"),
    },
    preview: (ctx, { inventoryId, ...a }) => inventory.previewAdjustInventory(ctx.db, inventoryId, a),
    execute: (ctx, { inventoryId, ...a }) => inventory.adjustInventory(ctx.db, inventoryId, a),
  }),
];

type UpdateArgs = Omit<products.ProductUpdateBody, "options" | "variants"> & {
  clearFields?: (typeof CLEARABLE)[number][];
  options?: { name: string; values: string[]; position?: number }[];
  variants?: products.ProductUpdateBody["variants"];
};

/** Map MCP args onto the PUT body: clearFields become explicit nulls. */
function toUpdateBody({ clearFields, options, ...rest }: UpdateArgs): products.ProductUpdateBody {
  const body: products.ProductUpdateBody = { ...rest };
  if (options) body.options = options.map((o, i) => ({ ...o, position: o.position ?? i }));
  for (const f of clearFields ?? []) {
    (body as Record<string, unknown>)[f] = null;
  }
  return body;
}
