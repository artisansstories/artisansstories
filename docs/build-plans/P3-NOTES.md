# P3 — v1 Storefront API + OpenAPI 3.1 + Swagger UI: completion notes

## What P3 delivers
The public, versioned, **API-key-authenticated** Storefront API that external
tenants (e.g. Orange Slice Sport) consume to render their branded store, plus a
machine-readable OpenAPI 3.1 spec and a Swagger UI page — the integration
contract / handoff artifact. Every endpoint is tenant-scoped through the P2
scoped client, so isolation holds on the public read **and** checkout paths.

## Shared helper — `src/lib/api-v1.ts`
`withApiKey(req, requiredScope, handler)` centralizes everything so routes are
thin:
- **Auth** — resolves tenant + scopes from `Authorization: Bearer <token>` via
  `resolveTenantFromApiKey`. Missing/invalid/revoked → **401**.
- **Scope** — read endpoints pass `SCOPE_STORE_READ` (`store:read`); checkout
  passes `SCOPE_CHECKOUT_CREATE` (`checkout:create`). Key valid but lacking the
  scope → **403**.
- **Rate limit** — best-effort in-memory **token bucket per raw token**, 120
  req/min, refilling continuously. Exceeded → **429** with `Retry-After`
  seconds. Per-process only (NOT distributed).
- **CORS** — permissive (`Access-Control-Allow-Origin: *`, `GET, POST, OPTIONS`)
  on every response. `corsPreflight()` is re-exported by each route as its
  `OPTIONS` handler.
- On success calls `handler({ tenantId, scopes, db })` where `db =
  getTenantPrisma(tenantId)` (the scoped client). Handler throw → **500**.

Also exports `jsonOk()` (CORS-wrapped JSON), and the shared product-card shape
`PRODUCT_CARD_SELECT` + `mapProductCard()` — identical fields/mapping to
`src/app/api/shop/products` so the list/featured cards stay consistent.

## Endpoints (all under `src/app/api/v1/store/`)
1. `GET theme` — `{ tenant{slug,name}, theme{logoUrl,faviconUrl,primaryColor,
   secondaryColor,accentColor,fontHeading,fontBody,radius}, storeName,
   storeDescription }`. Reads `TenantTheme` (by tenantId) + `StoreSettings`
   (scoped `findFirst`) + the global `Tenant` row; falls back to sane defaults
   when no theme row exists.
2. `GET products` — paginated/filterable ACTIVE products. Params: `category`,
   `q` (name/description, case-insensitive contains), `tag`/`tags` (csv),
   `minPrice`/`maxPrice` (cents), `sort`
   (featured|newest|price-asc|price-desc|best-selling), `page` (1),
   `limit` (12, max 48). Response mirrors the shop route:
   `{ products[], total, page, totalPages, categories[] }`.
3. `GET products/[slug]` — full detail. Variants expose **`available: boolean`**
   (derived from inventory tracked/quantity/reserved/backorder) — **never raw
   counts**. Includes images (ordered), options, categories, addons (enabled),
   artisans (basic), and an APPROVED-review summary `{ average, count }`.
   404 if not in tenant.
4. `GET categories` — active categories (scoped), flat list with `parentId` for
   tree building: `[{id,slug,name,parentId,productCount}]`. `productCount` is a
   filtered relation count of ACTIVE products.
5. `GET products/featured` — up to `limit` (4, max 12) featured ACTIVE products,
   same card shape as the list endpoint.
6. `POST checkout/session` — **scope `checkout:create`**. Body
   `{ items:[{variantId,quantity,addons?}], successUrl, cancelUrl,
   customerEmail? }`. **P3 STUB**: does the full tenant-scoped validation
   (variant exists in tenant, product ACTIVE, qty≥1) and computes
   `amountSubtotal` from **DB prices only** (variant override else product
   base) — never trusts client price. Returns `{ ok:true, mode:"stub",
   amountSubtotal, currency:"usd", lineItems:[...], note:"Stripe Connect wired
   in P4" }`. Validation failure → **400**. P4 only swaps in the Stripe session
   create on top of this.
7. `GET orders/[id]` — scoped order lookup: `{id, orderNumber, status,
   financialStatus, fulfillmentStatus, total, currency, items:[...],
   createdAt}`. `Order` has no own `fulfillmentStatus` column, so it is derived
   from the latest `Fulfillment` (`UNFULFILLED` when none). 404 if not in tenant.

## OpenAPI + Swagger
- `GET /api/v1/openapi.json` — valid **OpenAPI 3.1.0** document (JS object →
  `NextResponse.json`). Describes all 7 paths, params, request/response bodies,
  the `bearerAuth` HTTP security scheme, and both scopes. Components/schemas:
  Error, Theme, Category, CategoryNode, Product, ProductDetail,
  CheckoutSessionRequest, CheckoutSessionResponse, Order. Server URL relative
  (`/`). Kept accurate to what the routes actually return.
- `GET /api/v1/docs` — self-contained HTML (text/html) rendering Swagger UI from
  the unpkg `swagger-ui-dist@5` CDN, pointed at `/api/v1/openapi.json`.

## Smoke test — `scripts/test-api.ts` (Gate B)
Standalone tsx script. Loads `.env.local`, upserts tenant zero, mints two
known test keys (rerunnable upsert by keyHash):
`oss_test_p3smoke` (`store:read`+`checkout:create`) and `oss_test_p3readonly`
(`store:read`). Tests by **importing the real route modules and invoking their
exported GET/POST with a constructed `NextRequest`** (verified to work under tsx
— the `@/` alias resolves and `NextResponse` works outside the Next runtime).
Asserts: theme→`theme.primaryColor`; products→`{products:Array,total:number}`;
featured→array; categories→array; no/bad token→**401**; checkout(valid)→
`ok:true` + numeric `amountSubtotal>0`; checkout(read-only key)→**403**. If
tenant zero has no ACTIVE variant it creates a throwaway product via the scoped
client. Cleans up both keys (and any throwaway) in `finally`. Prints
`API_SMOKE_PASS` / `API_SMOKE_FAIL: <reason>`.

## Verification (all green)
- `npx tsc --noEmit` → 0 errors.
- `npx tsx scripts/test-api.ts` → `API_SMOKE_PASS`.
- `npx tsx scripts/test-isolation.ts` → `ISOLATION_PASS` (no regression).
- openapi.json route → valid OpenAPI 3.1.0, 7 paths / 9 schemas, well-formed
  serializable JSON.

## Notes / handoff for P4
- Checkout pricing/validation is the contract P4 builds on: swap the stub return
  for a Stripe Connect session create using the already-computed `lineItems` /
  `amountSubtotal`. The tenant's `stripeConnectAccountId` / `platformFeeBps` /
  `checkoutMode` live on the `Tenant` row.
- Rate limiter is in-memory per process — fine for best-effort; move to a shared
  store if/when running multiple instances.
