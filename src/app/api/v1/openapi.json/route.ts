import { NextResponse } from "next/server";

/**
 * GET /api/v1/openapi.json
 * Machine-readable OpenAPI 3.1 description of the v1 Storefront API. Kept
 * accurate to what the route handlers under /api/v1/store/** actually return.
 */
const PRODUCT_CARD_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    name: { type: "string" },
    price: { type: "integer", description: "Price in cents" },
    compareAtPrice: { type: ["integer", "null"] },
    discountType: { type: ["string", "null"] },
    promoLabel: { type: ["string", "null"] },
    promoTheme: { type: ["string", "null"] },
    isFeatured: { type: "boolean" },
    totalSold: { type: "integer" },
    tags: { type: "array", items: { type: "string" } },
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          urlMedium: { type: ["string", "null"] },
          altText: { type: ["string", "null"] },
        },
      },
    },
    categories: { type: "array", items: { $ref: "#/components/schemas/Category" } },
    hasVariants: { type: "boolean" },
    variantId: { type: ["string", "null"] },
  },
} as const;

const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Artisans Stories — Storefront API",
    version: "1.0.0",
    description:
      "Public, API-key-authenticated Storefront API. Each tenant authenticates with a Bearer token and only ever sees its own data. Read endpoints require the `store:read` scope; checkout requires `checkout:create`.",
  },
  servers: [{ url: "/" }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Theme" },
    { name: "Products" },
    { name: "Categories" },
    { name: "Checkout" },
    { name: "Orders" },
  ],
  paths: {
    "/api/v1/store/theme": {
      get: {
        tags: ["Theme"],
        summary: "Tenant branding for embedding",
        security: [{ bearerAuth: ["store:read"] }],
        responses: {
          200: {
            description: "Theme payload",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Theme" } } },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/store/products": {
      get: {
        tags: ["Products"],
        summary: "List active products",
        security: [{ bearerAuth: ["store:read"] }],
        parameters: [
          { name: "category", in: "query", schema: { type: "string" }, description: "Category slug" },
          { name: "q", in: "query", schema: { type: "string" }, description: "Search name/description (case-insensitive)" },
          { name: "tag", in: "query", schema: { type: "string" }, description: "Single tag (alias of tags)" },
          { name: "tags", in: "query", schema: { type: "string" }, description: "CSV of tags" },
          { name: "minPrice", in: "query", schema: { type: "integer" }, description: "Min price in cents" },
          { name: "maxPrice", in: "query", schema: { type: "integer" }, description: "Max price in cents" },
          {
            name: "sort",
            in: "query",
            schema: { type: "string", enum: ["featured", "newest", "price-asc", "price-desc", "best-selling"] },
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 12, maximum: 48 } },
        ],
        responses: {
          200: {
            description: "Paginated product list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    products: { type: "array", items: { $ref: "#/components/schemas/Product" } },
                    total: { type: "integer" },
                    page: { type: "integer" },
                    totalPages: { type: "integer" },
                    categories: { type: "array", items: { $ref: "#/components/schemas/Category" } },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/store/products/featured": {
      get: {
        tags: ["Products"],
        summary: "Featured active products",
        security: [{ bearerAuth: ["store:read"] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 4, maximum: 12 } },
        ],
        responses: {
          200: {
            description: "Featured products",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { products: { type: "array", items: { $ref: "#/components/schemas/Product" } } },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/store/products/{slug}": {
      get: {
        tags: ["Products"],
        summary: "Product detail by slug",
        security: [{ bearerAuth: ["store:read"] }],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Product detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { product: { $ref: "#/components/schemas/ProductDetail" } },
                },
              },
            },
          },
          404: { $ref: "#/components/responses/NotFound" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/store/categories": {
      get: {
        tags: ["Categories"],
        summary: "Active categories with product counts",
        security: [{ bearerAuth: ["store:read"] }],
        responses: {
          200: {
            description: "Category list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { categories: { type: "array", items: { $ref: "#/components/schemas/CategoryNode" } } },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/store/checkout/session": {
      post: {
        tags: ["Checkout"],
        summary: "Create a checkout session (P3 stub)",
        description:
          "Validates items against the tenant's catalog and computes the subtotal from DB prices. P3 returns a stub; P4 swaps in the Stripe Connect session.",
        security: [{ bearerAuth: ["checkout:create"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CheckoutSessionRequest" } },
          },
        },
        responses: {
          200: {
            description: "Stub checkout session",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CheckoutSessionResponse" } },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/v1/store/orders/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Order lookup by id",
        security: [{ bearerAuth: ["store:read"] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Order",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
          },
          404: { $ref: "#/components/responses/NotFound" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Tenant API key as `Authorization: Bearer <token>`. Scopes: `store:read` (catalog/theme/orders), `checkout:create` (checkout).",
      },
    },
    responses: {
      Unauthorized: {
        description: "Missing, invalid, or revoked API key",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Forbidden: {
        description: "API key lacks the required scope",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      NotFound: {
        description: "Resource not found in this tenant",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      BadRequest: {
        description: "Invalid request",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
      Theme: {
        type: "object",
        properties: {
          tenant: {
            type: "object",
            properties: { slug: { type: "string" }, name: { type: "string" } },
          },
          theme: {
            type: "object",
            properties: {
              logoUrl: { type: ["string", "null"] },
              faviconUrl: { type: ["string", "null"] },
              primaryColor: { type: "string" },
              secondaryColor: { type: "string" },
              accentColor: { type: "string" },
              fontHeading: { type: "string" },
              fontBody: { type: "string" },
              radius: { type: "string" },
            },
          },
          storeName: { type: "string" },
          storeDescription: { type: ["string", "null"] },
        },
      },
      Category: {
        type: "object",
        properties: {
          id: { type: "string" },
          slug: { type: "string" },
          name: { type: "string" },
        },
      },
      CategoryNode: {
        type: "object",
        properties: {
          id: { type: "string" },
          slug: { type: "string" },
          name: { type: "string" },
          parentId: { type: ["string", "null"] },
          productCount: { type: "integer" },
        },
      },
      Product: PRODUCT_CARD_SCHEMA,
      ProductDetail: {
        type: "object",
        properties: {
          id: { type: "string" },
          slug: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          story: { type: ["string", "null"] },
          price: { type: "integer" },
          compareAtPrice: { type: ["integer", "null"] },
          discountType: { type: ["string", "null"] },
          promoLabel: { type: ["string", "null"] },
          promoTheme: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" } },
          isFeatured: { type: "boolean" },
          materialsUsed: { type: "array", items: { type: "string" } },
          disclaimer: { type: ["string", "null"] },
          images: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                url: { type: "string" },
                urlThumb: { type: ["string", "null"] },
                urlMedium: { type: ["string", "null"] },
                altText: { type: ["string", "null"] },
                position: { type: "integer" },
                variantId: { type: ["string", "null"] },
              },
            },
          },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                values: { type: "array", items: { type: "string" } },
                position: { type: "integer" },
              },
            },
          },
          variants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                sku: { type: ["string", "null"] },
                price: { type: ["integer", "null"] },
                optionValues: {},
                position: { type: "integer" },
                available: { type: "boolean", description: "True if purchasable; raw counts are never exposed" },
              },
            },
          },
          categories: { type: "array", items: { $ref: "#/components/schemas/Category" } },
          addons: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, type: { type: "string" }, config: {} },
            },
          },
          artisans: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                slug: { type: "string" },
                name: { type: "string" },
                status: { type: "string" },
                avatarUrl: { type: ["string", "null"] },
              },
            },
          },
          reviews: {
            type: "object",
            properties: { average: { type: "number" }, count: { type: "integer" } },
          },
        },
      },
      CheckoutSessionRequest: {
        type: "object",
        required: ["items", "successUrl", "cancelUrl"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["variantId", "quantity"],
              properties: {
                variantId: { type: "string" },
                quantity: { type: "integer", minimum: 1 },
                addons: {},
              },
            },
          },
          successUrl: { type: "string" },
          cancelUrl: { type: "string" },
          customerEmail: { type: "string" },
        },
      },
      CheckoutSessionResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          mode: { type: "string", examples: ["stub"] },
          amountSubtotal: { type: "integer", description: "Subtotal in cents, computed from DB prices" },
          currency: { type: "string" },
          customerEmail: { type: ["string", "null"] },
          successUrl: { type: "string" },
          cancelUrl: { type: "string" },
          lineItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                variantId: { type: "string" },
                productId: { type: "string" },
                name: { type: "string" },
                variantName: { type: "string" },
                quantity: { type: "integer" },
                unitAmount: { type: "integer" },
                lineAmount: { type: "integer" },
              },
            },
          },
          note: { type: "string" },
        },
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "string" },
          orderNumber: { type: "string" },
          status: { type: "string" },
          financialStatus: { type: "string" },
          fulfillmentStatus: { type: "string" },
          total: { type: "integer" },
          currency: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                variantTitle: { type: ["string", "null"] },
                sku: { type: ["string", "null"] },
                quantity: { type: "integer" },
                price: { type: "integer" },
                total: { type: "integer" },
              },
            },
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
} as const;

export function GET() {
  return NextResponse.json(openapi, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
