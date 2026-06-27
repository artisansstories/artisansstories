# P2 — Tenant-scoped Prisma client: completion notes

## What P2 delivers
Every tenant-owned write now flows through a **tenant-scoped Prisma client** that
auto-injects `tenantId` into `create`/`createMany`/`upsert` data and merges it into
every `where`. The P1 bridge `@default("tenant_artisans_stories")` has been **removed**
from `schema.prisma`, so the Prisma types now *require* `tenantId` on create — which is
exactly the signal that surfaced the 33 tsc errors this task fixed.

## Infra (already complete before this task)
- `src/lib/tenant-prisma.ts` — `getTenantPrisma(id)` / `tenantClient(id)`, `TENANT_SCOPED_MODELS`.
  The extension also exposes **`db.$tenantId`** on the client so handlers can stamp the id
  on writes the query hook can't reach (nested relation creates, non-scoped models).
- `src/lib/tenant-context.ts` — `DEFAULT_TENANT_ID = "tenant_artisans_stories"` plus
  resolvers and the three client factories below.

## Which routes use which resolver
- **Admin routes** (`src/app/api/admin/**`): `getTenantPrismaForAdmin(req)` — resolves the
  tenant from the admin session. Files touched: artisans, categories, contact/[id]/reply,
  discounts, inventory/[id], orders/[id]/fulfill, products + products/[id]/addons, settings,
  shipping + shipping/[id]/rates, tax, team.
- **Storefront / account / checkout / contact**: `getTenantPrismaForHost(req)` (or the
  lower-level `resolveTenantFromHost(req)` + `getTenantPrisma(tenantId)` where the route
  already had the id in scope). Files: account/addresses, account/returns, checkout/confirm,
  contact.
- **Magic-link verify** (`auth/customer/verify`): scopes by `record.tenantId` taken from the
  globally-unique magic-link token, via `getTenantPrisma(record.tenantId)`.

## Where explicit `tenantId` was needed (query hook can't auto-inject)
The `$allModels` extension only injects on a model's **own** top-level create. These cases
required an explicit `tenantId` value (sourced from `db.$tenantId` or an in-scope `tenantId`):

- **Nested relation creates** — they're typed as `...WithoutParentInput` and bypass the hook:
  - `account/returns` → each nested `ReturnItem` under `Return.create`.
  - `admin/shipping` → each nested `ShippingRate` under `ShippingZone.create`.
  - `checkout/confirm` → each nested `OrderItem` under `Order.create` (was already stamped),
    plus the `Customer`, the `Order` itself, and the `OrderItemAddon.createMany`.
- **Non-scoped models** (deliberately excluded from `TENANT_SCOPED_MODELS`):
  - `orders/[id]/fulfill` → `MagicLinkToken.create` uses raw `prisma`; `tenantId` stamped
    explicitly from `db.$tenantId`. (MagicLinkToken is keyed by its global secret token.)
- **TypeScript-required even though the hook injects at runtime**: because Prisma query
  extensions do not rewrite the client's *types*, `tenantId` is still a required field on
  every scoped `create`/`upsert`. So all flagged routes got `tenantId: db.$tenantId` added to
  the data object even where the runtime hook would have injected it anyway — the hook then
  overwrites with the identical value (harmless, behavior-preserving).

## Seed / maintenance scripts (no request context → tenant zero)
These run outside a request, so they hard-code the platform-owner id
`"tenant_artisans_stories"` on each create/upsert:
- `prisma/seed.ts` — StoreSettings, AdminUser, ShippingZone×2, ShippingRate×3, Category.
- `prisma/seed-addons.ts` — ProductAddon upsert.
- `scripts/seed-disclaimer.ts` — StoreSettings upsert.

## Bridge removal confirmed
`grep '@default("tenant_artisans_stories")' prisma/schema.prisma` → matches only a comment
documenting the removal; no `tenantId` field carries the default. The bridge is gone, and
required `tenantId` is now enforced by both the schema and the type system.

## Verification (all green)
- `npx tsc --noEmit` → 0 errors.
- `npx tsx scripts/test-isolation.ts` → `ISOLATION_PASS` (cross-tenant read/update/delete all
  blocked; same slug + same email coexist across two tenants).
- `npx tsx scripts/seed-tenant-zero.ts` → NULL tenantId count = 0 (no regression).
- `npx prisma db push` → already in sync; `npx prisma generate` → ok.
