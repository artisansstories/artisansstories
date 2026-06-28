# P1 — Multi-tenant schema + tenantId backfill — Decisions & Notes

Branch: `feat/multitenant`. Single database, multi-tenant via `tenantId`. Tenant
"zero" = Artisans Stories (the live, pre-existing data). No data was destroyed;
all existing rows now belong to tenant zero and behavior is 100% preserved.

## What was done
1. Added `Tenant`, `TenantApiKey`, `TenantTheme` models + `TenantStatus` enum.
2. Added `tenantId` to all 35 tenant-owned models + `@@index([tenantId])`.
3. Converted global business-key uniques to per-tenant composite uniques.
4. `npx prisma db push` (DB already in sync — additive change), `npx prisma generate`.
5. `scripts/seed-tenant-zero.ts` — idempotent backfill, ran successfully.
6. `npx tsc --noEmit` passes clean.

## Key decision: `tenantId String @default("tenant_artisans_stories")`

Every tenant-owned `tenantId` carries a **literal string default** equal to the
platform-owner tenant id. This single decision satisfies three hard constraints
at once, and is why no application code needed to change:

- **NOT NULL + automatic backfill.** A literal `@default(...)` on a `String`
  becomes a Postgres column `DEFAULT`. When `db push` adds the NOT NULL column to
  a table with existing rows, Postgres fills every existing row with the default.
  So existing data is backfilled at the moment the column is created — there is
  never a NULL window, and the column is genuinely `NOT NULL`.
- **`tsc` stays green with zero endpoint edits.** A field with a `@default` is
  *optional* in Prisma's generated create-input types. The codebase has ~34
  `.create()/.upsert()/.createMany()` call sites across products, orders,
  customers, reviews, settings, etc. None of them pass `tenantId`, and none had
  to be touched. Making `tenantId` a plain required scalar (no default) would
  have broken every one of those at compile time.
- **Behavior preserved.** With exactly one tenant today, every write defaulting
  to tenant zero is precisely the current behavior.

### Why a literal default rather than `dbgenerated(...)`
Both produce a Postgres column default and both make the field optional in the
create input. The literal form (`@default("tenant_artisans_stories")`) is simpler
and reads clearly, so it was chosen. The fixed id string
`tenant_artisans_stories` is duplicated in `scripts/seed-tenant-zero.ts`
(`TENANT_ZERO_ID`) and **must stay in sync** with the schema default.

### TEMPORARY — must be removed in P2
The default is a migration bridge, **not** the long-term design. P2 introduces
real tenant resolution (from host/subdomain/API key) and must:
1. Remove `@default("tenant_artisans_stories")` from every `tenantId` field.
2. Thread the resolved `tenantId` explicitly through all write paths.
3. Add proper `tenant Tenant @relation(...)` back-relations + FK + scoped reads
   (every query filtered by the active tenant) for true isolation.
Until then, any new row with an unspecified tenant silently lands in tenant zero.

## Composite unique conversions (global -> per-tenant)
Field-level `@unique` removed and replaced with `@@unique([tenantId, <field>])`
so two tenants can legitimately share the same business key:

| Model                | Was                | Now                              |
|----------------------|--------------------|----------------------------------|
| Product.slug         | `@unique`          | `@@unique([tenantId, slug])`     |
| Product.sku          | `@unique` (null)   | `@@unique([tenantId, sku])`      |
| ProductVariant.sku   | `@unique` (null)   | `@@unique([tenantId, sku])`      |
| Category.slug        | `@unique`          | `@@unique([tenantId, slug])`     |
| Discount.code        | `@unique`          | `@@unique([tenantId, code])`     |
| Artisan.slug         | `@unique`          | `@@unique([tenantId, slug])`     |
| KBArticle.slug       | `@unique`          | `@@unique([tenantId, slug])`     |
| Customer.email       | `@unique`          | `@@unique([tenantId, email])`    |
| Order.orderNumber    | `@unique`          | `@@unique([tenantId, orderNumber])` |
| AdminUser.email      | `@unique`          | `@@unique([tenantId, email])`    |
| AdminUser.phone      | `@unique` (null)   | `@@unique([tenantId, phone])`    |

Nullable composite keys (`sku`, `phone`) remain nullable — Postgres treats NULLs
as distinct, so multiple rows without a value do not collide.

### Singletons -> one-per-tenant
- **StoreSettings**: `id` default changed `"singleton"` -> `cuid()`, added
  `@@unique([tenantId])`. The existing row **keeps** `id="singleton"`, so all the
  existing `prisma.storeSettings.findUnique({ where: { id: "singleton" } })` and
  upsert/create-with-`id:"singleton"` call sites continue to work unchanged
  (verified: the row is still `id=singleton`, now `tenantId=tenant_artisans_stories`).
- **LinkTreeSettings**: `id` default `"singleton"` -> `cuid()`, added
  `@@unique([tenantId])`. Existing row keeps its id. (Accessed via raw SQL
  elsewhere; not affected.)
- **WelcomeEmailTemplate**: `id` default `"welcome"` -> `cuid()`, added
  `@@unique([tenantId])`. Existing row keeps its id.

### Left as global `@unique` (intentionally)
- `Tenant.slug`, `TenantApiKey.keyHash` — per the task, global by design.
- `MagicLinkToken.token` — a random secret; global uniqueness is the desired
  collision guarantee, not a per-tenant business key.
- `Inventory.variantId` — a 1:1 relation key, not a shared business key.
- `ProductAddon.@@unique([productId, type])` — `productId` already scopes to one
  tenant (a product belongs to a single tenant), so this is implicitly per-tenant.

## Index note
`@@index([tenantId])` was added to every tenant-owned model per the task spec.
On models that also have a leading-`tenantId` composite/unique
(e.g. `@@unique([tenantId, slug])` or `@@unique([tenantId])`), that index is
technically redundant with the constraint's underlying index, but it is kept for
explicitness and to match the spec. Harmless; can be pruned later if desired.

## Backfill script (`scripts/seed-tenant-zero.ts`)
- Upserts the tenant by `slug="artisans-stories"` with a **fixed** `id`
  (`tenant_artisans_stories`) matching the schema default.
- Runs `UPDATE "<Table>" SET "tenantId"=$1 WHERE "tenantId" IS NULL` for all 35
  tables (belt-and-braces: the column default already backfills on push, so this
  reports 0 updated on a fresh push — and makes the script safe to re-run).
- Ensures the StoreSettings singleton belongs to tenant zero.
- Creates a `TenantTheme` from existing StoreSettings colors.
- Verifies `NULL tenantId count = 0` and throws otherwise.

## Verification (run results)
- `npx prisma validate` — valid.
- `npx prisma db push --accept-data-loss` — applied. The `--accept-data-loss`
  flag was required only because Prisma flags *adding* `@@unique` constraints as
  potentially-lossy (it cannot know there are no duplicates). Verified beforehand:
  the singleton tables have exactly 1 row each and the base fields (slug, email,
  orderNumber, code, sku) were already globally unique, so zero duplicates exist
  and no data was lost. NOT NULL `tenantId` columns were backfilled by their
  `@default` at column-creation time.
- `npx prisma generate` — OK (client v7.6.0).
- `npx tsx scripts/seed-tenant-zero.ts` — Tenant `tenant_artisans_stories`,
  TenantTheme created, **NULL tenantId count = 0**.
- Row ownership spot-check: Product 4/4, Order 10/10, Customer 1/1, Category 5/5,
  Artisan 2/2, Discount 2/2, StoreSettings 1/1 all matched to tenant zero.
- `npx tsc --noEmit` — clean (0 errors).
