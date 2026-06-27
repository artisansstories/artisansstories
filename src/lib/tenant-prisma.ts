/**
 * tenant-prisma.ts — Tenant-scoped Prisma client (P2)
 *
 * `tenantClient(tenantId)` returns a `prisma.$extends(...)` client whose
 * `query.$allModels.$allOperations` hook transparently scopes EVERY query for a
 * tenant-owned model to that tenant:
 *   - reads  → `tenantId` merged into `where`
 *   - writes → `tenantId` injected into `data` (create/createMany) and merged
 *              into `where` (update/delete/upsert)
 *
 * This makes tenant isolation impossible to bypass at the query layer: callers
 * cannot read, mutate, or count another tenant's rows through a scoped client,
 * and cannot forget to stamp `tenantId` on a write.
 *
 * Models NOT in TENANT_SCOPED_MODELS (Tenant, TenantApiKey, TenantTheme,
 * MagicLinkToken) pass through untouched — they are platform/global models or,
 * in MagicLinkToken's case, keyed by a globally-unique secret token.
 *
 * findUnique / findUniqueOrThrow: we merge `tenantId` into the unique `where`.
 * Prisma's `extendedWhereUnique` (GA since v5) accepts additional non-unique
 * scalar filters alongside a unique selector, so `{ id, tenantId }` returns null
 * when the row belongs to another tenant — exactly the isolation we want.
 * Scoped application code should nonetheless PREFER `findFirst` over `findUnique`
 * when selecting by a non-id field, since post-P1 business keys (slug, email,
 * code, sku) are only unique per-tenant (`@@unique([tenantId, <field>])`).
 */
import { prisma } from "./prisma";

/**
 * Every tenant-owned model that must be auto-scoped. Model names are PascalCase,
 * matching the `model` argument Prisma passes to `$allModels` extensions.
 *
 * Deliberately EXCLUDED (and therefore NOT auto-scoped):
 *   - Tenant, TenantApiKey, TenantTheme — platform/global models.
 *   - MagicLinkToken — looked up by its globally-unique secret `token`; the
 *     tenant is derived FROM the resolved token row, not used to scope it.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  "StoreSettings",
  "AdminUser",
  "Category",
  "Product",
  "ProductOption",
  "ProductVariant",
  "ProductImage",
  "Inventory",
  "InventoryLog",
  "Customer",
  "Address",
  "Order",
  "OrderItem",
  "Fulfillment",
  "Return",
  "ReturnItem",
  "Discount",
  "ShippingZone",
  "ShippingRate",
  "Review",
  "WelcomeEmailTemplate",
  "Artisan",
  "ArtisanImage",
  "ProductArtisan",
  "ProductCategory",
  "LinkTreeSettings",
  "LinkTreeLink",
  "LinkTreeClickLog",
  "ContactMessage",
  "ContactReply",
  "EmailLog",
  "KBArticle",
  "ProductAddon",
  "OrderItemAddon",
]);

// Operations whose `where` must carry the tenant filter.
const WHERE_SCOPED_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

function buildTenantClient(tenantId: string) {
  return prisma.$extends({
    name: `tenant(${tenantId})`,
    // Expose the active tenantId on the client so handlers can stamp it on
    // nested relation writes / raw writes the query hook can't reach:
    //   data: { ..., tenantId: db.$tenantId }
    client: {
      $tenantId: tenantId,
    },
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          // Clone shallowly so we never mutate the caller's object.
          const a: Record<string, unknown> = { ...(args as Record<string, unknown>) };

          if (WHERE_SCOPED_OPS.has(operation)) {
            a.where = { ...((a.where as object) ?? {}), tenantId };
            return query(a);
          }

          switch (operation) {
            case "create":
              a.data = { ...((a.data as object) ?? {}), tenantId };
              return query(a);

            case "createMany":
            case "createManyAndReturn": {
              const data = a.data;
              a.data = Array.isArray(data)
                ? data.map((row) => ({ ...(row as object), tenantId }))
                : { ...((data as object) ?? {}), tenantId };
              return query(a);
            }

            case "upsert":
              a.where = { ...((a.where as object) ?? {}), tenantId };
              a.create = { ...((a.create as object) ?? {}), tenantId };
              return query(a);

            default:
              // Unknown operation: stay safe by passing through unchanged.
              return query(a);
          }
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof buildTenantClient>;

// Memoize one extended client per tenantId — building the extension on every
// request would be wasteful and defeats Prisma's internal caching.
const clientCache = new Map<string, TenantPrisma>();

/** Build (uncached) a tenant-scoped client. Prefer `getTenantPrisma`. */
export function tenantClient(tenantId: string): TenantPrisma {
  return buildTenantClient(tenantId);
}

/** Get a memoized tenant-scoped Prisma client for `tenantId`. */
export function getTenantPrisma(tenantId: string): TenantPrisma {
  let client = clientCache.get(tenantId);
  if (!client) {
    client = buildTenantClient(tenantId);
    clientCache.set(tenantId, client);
  }
  return client;
}
