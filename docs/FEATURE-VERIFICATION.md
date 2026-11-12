# Feature verification: admin routes and MCP tools

Every `/api/admin/*` route + method and every MCP tool (93) is covered by integration tests in `tests/e2e/`. They run against a throwaway local Postgres seeded with two stores (`artisans-stories`, the house store, and `other-store`), with every external service faked. Run them with:

```bash
npm run test:e2e          # starts /tmp/as-testdb on :54329, runs everything, stops it
E2E_KEEP_DB=1 npm run test:e2e   # leave the database running
E2E_SKIP_UI=1 npm run test:e2e   # skip the next build + browser tests
```

## How the tests work

- **Database:** `scripts/test-db.sh` runs a Postgres 17 cluster in `/tmp/as-testdb` (port 54329, trust auth), runs `prisma db push`, then applies `tests/e2e/sql/prod-drift.sql`, which adds the production-only tables and columns that raw-SQL services use (`LandingPageSettings`, `LinkTreeSettings.customSlug`). The suite refuses to start unless `DATABASE_URL` is `localhost`/`127.0.0.1`. Before **every** test, all tables are truncated and `tests/e2e/seed.ts` reseeds them with fixed ids.
- **External services** (`tests/e2e/helpers/fakes.ts`):
  - **Stripe:** a stateful fake that models payment intents, charges, refunds, `refunds.list` and idempotency-key replay.
  - **Resend, R2/S3, carrier tracking:** recorders that tests can make fail on purpose.
  - **DNS:** only the fake image host resolves.
  - **Global `fetch`:** refuses every host except the fake image host and, when a test opts in, fake Instagram token endpoints.
- **Admin route path:** the real route handler is called with a session minted by the real `createAdminSession` (same JWT, HS256, test `NEXTAUTH_SECRET`). The DB effect is checked through the read path a person would use: the GET route and/or the matching MCP read tool.
- **MCP path:** the SDK client talks Streamable HTTP to the real `/api/mcp` route handler in-process, with real `TenantApiKey` rows. Every write tool is run as preview (DB unchanged, no Stripe or email call) → confirm (change applied) → replay of the same confirm (blocked, no second side effect) → read back with the read tool. Every read tool is checked against seeded values.
- **Admin UI:** `next build --webpack` + `next start` against the local DB, opened in headless Chromium.
  - The server runs with `.env` loading disabled (`__NEXT_PROCESSED_ENV`) and every `.env` key neutralised.
  - All outbound HTTP goes through a local proxy that refuses and records it. The suite fails if anything tried to leave the machine.

## Counts

| Suite | Files | Tests |
|---|---|---|
| Unit (`npx vitest run`) | 16 | 151 |
| E2E (`npm run test:e2e`) | 25 | 640 |

## Matrix

Route paths are relative to `/api/admin/`. ✓ means covered and passing. "401/404" means the route was also checked with no session (401) and with an unknown id and the other store's id (404, not 500).

### Orders: `tests/e2e/api/orders.test.ts`, `orders-money.test.ts`

| Feature | Route + methods | Route test | MCP tool(s) | MCP test | Notes |
|---|---|---|---|---|---|
| List / search / filter | `orders` GET | ✓ | `orders_list` | ✓ | filters, paging, junk params → defaults; other store sees only its own |
| CSV export | `orders?export=csv` GET | ✓ | `orders_list` (same data) | ✓ | |
| Order detail | `orders/[id]` GET | ✓ | `orders_get` | ✓ | by id or order number; 401/404 |
| Admin note | `orders/[id]/note` PATCH | ✓ | `orders_set_note` | ✓ | non-string 400; 404 |
| Mark delivered | `orders/[id]/deliver` POST | ✓ | `orders_mark_delivered` | ✓ | wrong status 400 |
| Fulfill + capture | `orders/[id]/fulfill` POST | ✓ | `orders_fulfill` | ✓ | read back via `orders_get`; capture key `order_capture_<id>`; items from other orders and CANCELLED/REFUNDED orders refused |
| Cancel | `orders/[id]/cancel` POST | ✓ | `orders_cancel` | ✓ | PAID refunds, AUTHORIZED/PENDING voids; double submit = one refund; Stripe failure reported as `paymentError` |
| Refund | `orders/[id]/refund` POST | ✓ | `orders_refund` | ✓ | full, partial, final partial → REFUNDED; double submit = one refund; Stripe failure → nothing changed; retry reuses an unrecorded refund |
| Resend confirmation | `orders/[id]/resend-email` POST | ✓ | `orders_resend_confirmation` | ✓ | provider rejection → 502, not logged |
| Carrier tracking | `orders/check-tracking` POST | ✓ | `orders_check_tracking` | ✓ | fake carrier; preview calls no carrier |

### Returns: `tests/e2e/api/returns.test.ts`, `returns-refund.test.ts`

| Feature | Route + methods | Route test | MCP tool(s) | MCP test | Notes |
|---|---|---|---|---|---|
| List | `returns` GET | ✓ | `returns_list` | ✓ | |
| Detail | `returns/[id]` GET | ✓ | `returns_get` | ✓ | 401/404 |
| Admin note | `returns/[id]` PUT | ✓ | `returns_set_note` | ✓ | 404 |
| Approve | `returns/[id]/approve` POST | ✓ | `returns_approve` | ✓ | one email + log |
| Reject | `returns/[id]/reject` POST | ✓ | `returns_reject` | ✓ | |
| Receive | `returns/[id]/receive` POST | ✓ | `returns_receive` | ✓ | no restock, no money |
| Raw status | `returns/[id]/status` PATCH | ✓ | `returns_set_status` | ✓ | |
| Refund (+ restock) | `returns/[id]/refund` POST | ✓ | `returns_refund` | ✓ | variant with no inventory row: row + log created, one Stripe refund; already refunded → 409 before Stripe; DB failure after Stripe → 500 `moneyMoved`, then the retry records it without refunding again |

### Products, categories, inventory, uploads: `tests/e2e/api/catalog-*.test.ts`

| Feature | Route + methods | Route test | MCP tool(s) | MCP test | Notes |
|---|---|---|---|---|---|
| Product list | `products` GET | ✓ | `products_list` | ✓ | |
| Create product | `products` POST | ✓ | `products_create` | ✓ | artisan link in the same create; other store's category/artisan refused |
| Product detail | `products/[id]` GET | ✓ | `products_get` | ✓ | |
| Update product | `products/[id]` PUT | ✓ | `products_update` | ✓ | 7 mid-write failures leave options, variants, inventory, images and categories exactly as before; duplicate SKU 409 |
| Delete product | `products/[id]` DELETE | ✓ | `products_delete` | ✓ | cascade checked |
| Add-ons | `products/[id]/addons` GET, PUT | ✓ | `products_addons_get`, `products_addons_set` | ✓ | unknown product 404 |
| Generate SKU | `products/generate-sku` POST | ✓ | `products_generate_sku` | ✓ | collision retries |
| Image upload | `upload` POST (multipart) | ✓ | `products_upload_image` (https URL) | ✓ | real PNG → 3 WebP files under `tenants/<id>/products/`; failed R2 write → 502; private host refused |
| Categories | `categories` GET, POST; `categories/[id]` GET, PUT, DELETE | ✓ | `categories_list/get/create/update/delete` | ✓ | parent must exist, be in this store, not be itself |
| Inventory | `inventory` GET; `inventory/[id]` PATCH | ✓ | `inventory_list`, `inventory_adjust` | ✓ | one `InventoryLog` row per change |

### Customers, discounts, shipping, tax: `tests/e2e/api/commerce*.test.ts`

| Feature | Route + methods | Route test | MCP tool(s) | MCP test | Notes |
|---|---|---|---|---|---|
| Customers | `customers` GET; `customers/[id]` GET, PATCH | ✓ | `customers_list/get/update` | ✓ | 404 (was 500) |
| Discounts | `discounts` GET, POST; `discounts/[id]` GET, PUT, PATCH, DELETE; `discounts/generate-code` GET | ✓ | `discounts_list/get/create/update/delete/generate_code` | ✓ | PATCH toggle = `discounts_update {isActive}`; 409 duplicate; 404 |
| Shipping zones | `shipping` GET, POST; `shipping/[id]` GET, PUT, DELETE | ✓ | `shipping_zones_list`, `shipping_zone_create/update/delete` | ✓ | GET by id covered by `shipping_zones_list` |
| Shipping rates | `shipping/[id]/rates` POST; `shipping/[id]/rates/[rateId]` PUT, DELETE | ✓ | `shipping_rate_create/update/delete` | ✓ | rate must belong to the zone; a FREE rate stays at price 0 |
| Tax | `tax` GET, PUT | ✓ | `tax_get`, `tax_update` | ✓ | Pixel ID untouched; other store independent; `add_store_tax_settings.sql` tested on legacy rows, a real Pixel ID, malformed values, and a second run |

### Dashboard, reports, settings, team, AI Assistants: `tests/e2e/api/admin-*.test.ts`

| Feature | Route + methods | Route test | MCP tool(s) | MCP test | Notes |
|---|---|---|---|---|---|
| Dashboard | `dashboard` GET | ✓ | `dashboard_summary` | ✓ | numbers computed from the seed |
| Reports | `reports/{sales,products,customers,discounts}` GET | ✓ | `reports_sales/products/customers/discounts` | ✓ | |
| Store settings | `settings` GET, PUT | ✓ | `settings_get`, `settings_update` | ✓ | whitelist: `tenantId` and `mcpEnabled` can't be set |
| Email branding | `settings` PATCH | ✓ | `settings_update_email_branding` | ✓ | |
| Team | `team` GET, POST; `team/[id]` PUT, DELETE | ✓ | `team_list/add/update/remove` | ✓ | role gates checked live; other store's invite is branded for that store, links to its host, and the real verify route signs the new admin into that store; Resend failure → `invite.sent:false` |
| AI Assistants | `mcp` GET, PATCH; `mcp/keys` POST; `mcp/keys/[keyId]` DELETE | ✓ | (enables MCP itself) | ✓ | switching off blocks MCP (403); a minted key connects; a revoked key is refused (401); EDITOR 403 |

### Artisans, KB, contact, communications, Instagram: `tests/e2e/api/content-*.test.ts`

| Feature | Route + methods | Route test | MCP tool(s) | MCP test | Notes |
|---|---|---|---|---|---|
| Artisans | `artisans` GET, POST; `artisans/[id]` GET, PUT, DELETE | ✓ | `artisans_list/get/create/update/delete` | ✓ | the exact admin-form body keeps `region`, `practicingSince`, `featuredPosts`, `socialEmbedCode`; explicit nulls clear them; Instagram tokens never returned; other store 403 |
| Knowledge base | `kb/articles` GET; `kb/articles/[slug]` GET, PUT | ✓ | `kb_articles_list/get/update` | ✓ | same slug in the other store never visible |
| Contact inbox | `contact` GET; `contact/[id]` PATCH | ✓ | `contact_messages_list`, `contact_message_get`, `contact_message_update` | ✓ | |
| Contact reply | `contact/[id]/reply` POST | ✓ | `contact_message_reply` | ✓ | sends first; Resend failure → 502 with nothing recorded; HTML escaped |
| Communications | `communications` GET; `email-log/[id]` GET | ✓ | `communications_list`, `email_log_get` | ✓ | |
| Instagram connect | `instagram/connect` GET; `instagram/callback` GET; `instagram/disconnect` POST | ✓ | `instagram_status` (read-only) | ✓ | see "Not testable locally" |

### Email template, landing page, Link Hub: `tests/e2e/api/storefront*.test.ts`

| Feature | Route + methods | Route test | MCP tool(s) | MCP test | Notes |
|---|---|---|---|---|---|
| Welcome email template | `email-template` GET, POST | ✓ | `email_template_get/update` | ✓ | house only (other store 403, tool not listed) |
| Email images | `email-template/upload-logo` POST, `upload-avatar` POST | ✓ | `email_template_upload_logo/avatar` | ✓ | images only; stored under `tenants/<id>/email/` |
| Landing page | `landing-page/settings` GET, POST | ✓ | `landing_page_get/update` | ✓ | GET now requires a house admin |
| Landing images | `landing-page/upload` POST | ✓ | `landing_page_upload_image` | ✓ | known slots only |
| Link Hub settings | `linktree/settings` GET, POST | ✓ | `linktree_settings_get/update` | ✓ | publish/unpublish checked on the public `/links` page |
| Link Hub links | `linktree/links` GET, POST, PUT, DELETE; `linktree/links/reorder` POST | ✓ | `linktree_links_list`, `linktree_link_create/update/delete`, `linktree_links_reorder` | ✓ | other store's link id → 404, untouched |
| Link Hub analytics | `linktree/analytics` GET | ✓ | `linktree_analytics` | ✓ | counts match the seeded click logs |

### Cross-cutting: `tests/e2e/api/mcp-isolation.test.ts`, `mcp-scopes.test.ts`, `auth-sweep.test.ts`, `session-liveness.test.ts`

| Property | Test | Notes |
|---|---|---|
| Tenant isolation | ✓ | The list of every tool argument that names a record is built from the live registry, and a guard fails if a tool is missing from it. Each is tried with the other store's key against a house row: no data, no confirm token, no side effect, house rows unchanged. A smuggled `tenantId` and confirm tokens from the other store are refused. |
| House-only tools | ✓ | `tools/list`: house admin 93, house read 39, other admin 69, other read 29. The 24 house-only tools are not listed for the other store and calling one fails cleanly. |
| Read-only key | ✓ | Only `[Read]` tools are listed; calling any write tool name fails with no DB change. Storefront and revoked keys → 401; store switch off or store suspended → 403. |
| No session → 401 | ✓ | All 100 handlers in the 67 admin route files (found on disk at test time) × 10 bad-cookie variants → 401, never 500, with no side effect. |
| Role gates | ✓ | EDITOR / ADMIN / SUPER_ADMIN refusals match between routes, MCP and the UI. Roles and active status are read live, so a deactivated or deleted admin's existing session stops working immediately. |
| Admin UI pages | ✓ | `tests/e2e/ui/admin-pages.test.ts`: all 33 house `/admin` pages and 6 other-store pages, with seeded data on screen and no error page, browser exception or API 5xx; house-only pages redirect for the other store; the AI Assistants flow (toggle, mint, use, list, revoke) works; no outbound requests. |

## Not testable locally, and how each is covered instead

- **Instagram OAuth against real Instagram:** needs a registered app and a real login. Covered:
  - the authorize redirect, with a nonce cookie;
  - the full callback success path, against fake Instagram token endpoints;
  - the CSRF cases (missing or wrong nonce, and the old state format);
  - every error branch, and `disconnect`.
- **Real Stripe, Resend, R2 and carriers:** replaced by fakes that model the behaviour the code relies on (Stripe refund balances, idempotency replay, `refunds.list`). The Stripe idempotency-key format is checked exactly.
- **HEIC conversion and AI alt text:** there's no HEIC sample, and `OPENROUTER_API_KEY` is deliberately unset, so `altText` is null in tests.
- **Concurrency across separate server instances:** the double-submit tests run two requests at once in one Node process against one Postgres. Production runs on many Vercel instances, where only the DB conditional writes and the Stripe idempotency keys protect against duplicates. Both of those are exercised.
