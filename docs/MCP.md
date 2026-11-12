# MCP server: Artisans Stories store admin

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI assistant (Muse, Grokbot, Claude, ChatGPT, …) do anything a store admin can do in `/admin`, for **one store**, with a human approving every change.

- **Transport:** Streamable HTTP, stateless (`sessionIdGenerator: undefined`, `enableJsonResponse: true`). One fresh server per POST, and every reply is a plain JSON body, never a long-lived SSE stream, so it fits Vercel serverless (`runtime = "nodejs"`, `maxDuration = 60`).
- **SDK:** `@modelcontextprotocol/sdk` `WebStandardStreamableHTTPServerTransport` inside Next 16 route handlers.
- **Tenant isolation:** the store comes **only** from the verified key/token. No tool takes a tenant argument. Tools run on the tenant-scoped Prisma client (`getTenantPrisma(ctx.tenantId)`).
- **Same logic as the admin UI:** every tool calls the same `src/lib/admin-services/*` function the matching `/api/admin/*` route calls.

## Launch checklist (operator)

Do these in order. Step 1 must come before the deploy: `schema.prisma` now declares `StoreSettings.mcpEnabled`, so every generated `storeSettings` query selects that column, and **deploying before the SQL runs breaks the storefront and admin for every store.**

1. **Run the migration** against production Neon (and any other database the build talks to, such as preview branches):
   ```bash
   psql "$DATABASE_URL" -f prisma/migrations/add_mcp.sql
   ```
   It's idempotent, so re-running it is harmless. It adds `StoreSettings."mcpEnabled"` (default `false`) and the `McpNonce` table. Rollback SQL is in the file header. Do **not** use `prisma migrate` or `prisma db push` for this.
2. **Set the env vars** in Vercel (Production, plus Preview if wanted): `MCP_ENABLED=true` and `MCP_TOKEN_SECRET` (`openssl rand -base64 48`). `MCP_OAUTH_REDIRECT_HOSTS` is optional. See [Environment variables](#environment-variables-set-in-vercel).
3. **Deploy.**
4. **Enable per store:** a SUPER_ADMIN or ADMIN of that store opens **Admin → AI Assistants**, turns access **On**, and creates a key. The setup message shows the MCP URL of the host they're on (`https://artisansstories.com/api/mcp` for the house store, `https://{slug}.artisansstories.com/api/mcp` for a tenant). Either URL works for any store's key, because the key picks the store.
5. **Smoke test** with a real key: `MCP_KEY=oss_live_… MCP_URL=https://<host>/api/mcp npx tsx scripts/mcp-smoke.ts` (read-only: `initialize` + `tools/list`).

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/mcp` | MCP transport. Credential in `Authorization: Bearer <key or token>`. |
| `POST /api/mcp/<token>` | Same server, credential in the URL path, for clients that only take a URL. The header wins if both are sent. |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata |
| `GET /.well-known/oauth-protected-resource[/api/mcp]` | RFC 9728 metadata (both forms) |
| `POST /oauth/register` | RFC 7591 dynamic client registration (public clients, PKCE) |
| `GET /oauth/authorize` | Validates, then sends the user to `/admin/oauth/consent` (admin magic-link login if needed) |
| `POST /oauth/authorize/decision` | Consent form target (same-origin + admin session) |
| `POST /oauth/token` | `authorization_code` + PKCE S256 → 30-day access token |
| `GET/PATCH /api/admin/mcp`, `POST /api/admin/mcp/keys`, `DELETE /api/admin/mcp/keys/:id` | Back the Settings → AI Assistants page |

`GET`/`DELETE /api/mcp` return 405 with `Allow: POST, OPTIONS`, as the spec requires of a stateless server with no SSE stream and no sessions. An unauthenticated POST returns 401 with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`, which is how OAuth clients discover the flow. `<origin>` is the host the client called.

**CORS:** `/api/mcp`, `/api/mcp/<token>`, `/oauth/register`, `/oauth/token`, `/oauth/authorize` and both `.well-known` documents answer `OPTIONS` preflights (204) and send `Access-Control-Allow-Origin: *` on their responses. Allowed request headers: `Authorization`, `Content-Type`, `Accept`, `Mcp-Session-Id`, `Mcp-Protocol-Version`, `Last-Event-ID`. Exposed: `WWW-Authenticate`, `Mcp-Session-Id`, `Mcp-Protocol-Version`, `Retry-After`. The wildcard is safe because none of these endpoints use cookies. `/oauth/authorize/decision` (the consent form target, which rides the admin session cookie) deliberately has no CORS and checks same-origin.

**Accept header:** the SDK rejects a POST unless `Accept` lists both `application/json` and `text/event-stream`. Since we always answer with JSON, a client that sends only `application/json`, `*/*`, or no `Accept` is accepted too.

**Rate limits (best effort, per instance):**

| Endpoint | Key | Limit |
|---|---|---|
| `/api/mcp` | client IP | 300 / minute |
| `/api/mcp` | credential (sha256 of it) | 120 / minute |
| `/oauth/token` | client IP | 20 / minute |

Over the limit, the server answers 429 with `Retry-After`, before any database work. ⚠️ Counters live in each serverless instance's memory and reset on cold start, so the real ceiling across Vercel is the limit × the number of warm instances. This blunts bursts and brute force from one client; it is not a quota. For a hard global limit, add a shared store (Upstash/Redis) or Vercel WAF rate-limit rules.

The server works on the apex **and** on tenant subdomains (`{slug}.artisansstories.com/api/mcp`). The host does not pick the store; the credential does.

## Enabling it

Access needs **all** of these, checked live on **every** request. Each one fails closed:

1. **Platform switch:** env `MCP_ENABLED=true` and `MCP_TOKEN_SECRET` set (≥ 32 chars). If either is missing, every MCP/OAuth endpoint returns **404**.
2. **Store switch:** `StoreSettings.mcpEnabled`, set from **Settings → AI Assistants** (SUPER_ADMIN/ADMIN only). Default off. Comes from `prisma/migrations/add_mcp.sql`. See [Migration](#migration). It can't be written through the general settings save, because that only accepts a whitelist of fields.
3. **Store active:** `Tenant.status === "ACTIVE"`.
4. **Credential valid:** the API key exists, isn't revoked, and has an `mcp:*` scope. For OAuth tokens, the admin user still exists, is active, and belongs to the token's store.

If the credential is valid but the store switch is off, the server returns 403 with a message saying where to turn it on.

## Credentials

### 1. MCP key (primary path; recommended for Muse and Grokbot)

A `TenantApiKey` (`oss_live_…`) with scope **`mcp:admin`** (full) or **`mcp:read`** (read-only). Only the sha256 hash is stored. All whitespace is stripped before verification, so a key pasted with line breaks still works.

**Minting, for a store admin (Anna):** Admin → **AI Assistants** (also linked from Settings) → turn access **On** → **Connect Muse** or **Connect Grokbot** → choose **Full access** or **Read-only** → **Create key**. The page shows the key **once**, with a ready-to-paste setup message and separate copy buttons. Active keys are listed with access level, last used and created dates, and a one-click **Revoke**. Only `SUPER_ADMIN`/`ADMIN` users can create or revoke keys or flip the switch, and keys are always minted for the admin's own store.

**Minting, for a platform operator:** Platform → API Keys (or the tenant page) → mint key → tick **`mcp:admin`** or **`mcp:read`**.

API keys act with the `ADMIN` role. `team_remove` needs `SUPER_ADMIN` (same as the UI), so it is blocked for keys. To remove an admin, use OAuth as a super admin, or the UI.

### 2. OAuth 2.1 + PKCE (secondary)

For clients that only do OAuth (claude.ai, ChatGPT). Give the client the URL `https://<host>/api/mcp`; it discovers everything from the 401. Redirect URIs must be `https` on an **exact** hostname in `MCP_OAUTH_REDIRECT_HOSTS` (default `claude.ai, www.claude.ai, claude.com, www.claude.com, chatgpt.com, platform.openai.com`). One bad URI rejects the whole registration. The user signs in with the normal admin magic link, then picks Full or Read-only on the consent page. The token carries `sub` (AdminUser id), `tenantId`, `scope`, `via:"mcp"`.

Client ids, 5-minute auth codes and access tokens are HS256 JWTs signed with `MCP_TOKEN_SECRET`, each with a distinct `typ`. **Auth codes are single-use:** once the code, client, `redirect_uri` and PKCE verifier all check out, `/oauth/token` claims the code in `McpNonce` (kind `oauth_code`). A replay, or a second concurrent exchange, gets `invalid_grant` "Code was already used". The claim happens only after PKCE passes, so someone holding a stolen code without the verifier can't burn the real client's code. If the claim can't be recorded (DB error), the endpoint returns 503 and issues nothing.

## Connecting Muse

Muse has no URL form. You ask it in chat to build a connector, and it runs the client in Meta's cloud, so the server must be **public HTTPS** (no localhost).

1. In AI Assistants, click **Connect Muse** and create a key.
2. Paste the generated message into Muse. It reads:
   > Build a custom connector to my Artisans Stories store admin. Its MCP server is https://&lt;host&gt;/api/mcp (Streamable HTTP). It takes my key as an Authorization: Bearer header; ask me for the key in your secure credentials prompt. List the tools, save it as a skill called 'Artisans Stories', and run one read check from the saved skill.
3. When Muse opens its secure credentials prompt, paste the key.

Use the **header**, not `/api/mcp/<key>`. Muse's stand-in-token substitution only covers headers. Muse labels tools Read / Write / Sensitive write from our annotations and asks "Allow once" for sensitive writes.

## Connecting Grokbot (or any remote MCP client with a bearer key)

1. Click **Connect Grokbot** and create a key.
2. Paste the generated message:
   > Connect to my Artisans Stories store admin as a remote MCP server. Server URL: https://&lt;host&gt;/api/mcp (Streamable HTTP transport). Authentication: send my API key in an Authorization: Bearer header. Ask me for the key through your secure credentials or connector settings rather than in chat if you can. After connecting, list the tools and run one read-only check (dashboard_summary) to confirm it works.
3. Only if the client accepts nothing but a URL, use `https://<host>/api/mcp/<key>` (shown under "Advanced"). Treat that URL as a secret.

Claude and ChatGPT connectors: give them `https://<host>/api/mcp` and they run the OAuth flow.

## How tools behave

- **Tags:** every description starts with `[Read]`, `[Write]` or `[Sensitive write]`. Every tool sets `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` (true for anything that emails a customer, moves money, or calls an outside service).
- **Sensitive** covers refunds, cancellations, payment capture (fulfilling an authorized order), customer emails and replies, resend-email, team changes, deletes, and anything that publishes (product or artisan to ACTIVE, store live/unlive, landing page, Link Hub, email template).
- **Preview → confirm** (every write). The first call, without `confirmToken`, writes nothing and returns `status:"pending_confirmation"`, a `preview` with real values (refund amount and refundable balance, email recipient and subject, rows affected, before/after diffs), and a `confirmToken`. The second call with identical arguments plus the token executes. The token is an HMAC over (tenant, tool, canonical args, expiry): keys sorted, nulls dropped, 10-minute TTL, compared with `timingSafeEqual`. The preview is **re-run** on confirm, so a state change in between (e.g. the order was already refunded) blocks instead of executing.
- **Single-use confirm tokens:** after the token verifies and the preview re-runs, the kit claims the token by inserting `sha256(token)` into `McpNonce` (kind `confirm`), **before** the side effect. The primary key is the only arbiter, so of any number of sequential or concurrent confirms with one token, exactly one executes. The rest get `{done:false, blocked:true, reason:"This confirmation was already used. Request a new preview."}`. If the claim itself fails (DB error), nothing runs and the result says so (fail closed).
- **Outcomes:** `pending_confirmation` → `confirmed` (`done:true`), or `done:false, blocked:true, reason, retry` with retry guidance by status (401 reconnect, 403 don't retry, 404 recheck ids, 409 conflict, 5xx retry once). Expected failures are never `isError`. If the side effect **throws** midway, the token stays claimed and the result is `status:"unknown"` with `checkWith` naming the read tool to check first (e.g. `orders_get` for `orders_refund`, `returns_get` for returns, `contact_message_get` for replies). Any retry needs a new preview.
- **Idempotency (same for the admin UI and MCP):** money paths no longer depend on the confirm token. Each Stripe call gets a key derived from stable ids:
  - return refund: `return_refund_<returnId>`;
  - order refund: `order_refund_<orderId>_<order updatedAt ms>_<amount|full>`;
  - cancel: `order_cancel_<orderId>_refund|void`;
  - capture: `order_capture_<orderId>`.

  Two more guards sit around that:
  - Before creating a refund, the service looks for an earlier refund on the payment intent with matching metadata. A retry after a failed DB write then records the existing refund instead of refunding again, even after Stripe's 24h key window.
  - DB writes are conditional on status or version, so concurrent requests record a refund once.
- **Optional fields** are `.nullish()`, and null is normalized to undefined before handlers run (enforced by a unit test over every tool).
- **Registries:** `mcp:read` credentials get only the read tools registered. House-only areas (artisans, KB, Link Hub, landing page, email template, Instagram) are registered only for the house store, matching the admin nav.
- **Audit:** every executed write (confirmed or failed) is written to `PlatformAuditLog` with `action:"mcp.<tool>"`, `operatorId` set to the key or user id, `operatorEmail` set to the admin email or `mcp-key:<name>`, `tenantId`, and `detail` JSON `{via:"mcp", principal, args, outcome}`. These rows show up on Platform → Activity.
- **Server instructions** tell the model it cannot approve refunds, emails or other writes for the user, must show the preview and wait, must never invent a confirm token, and must check status before retrying.

## Environment variables (set in Vercel)

| Var | Required | Notes |
|---|---|---|
| `MCP_ENABLED` | yes | `true` to expose the surface. Anything else → 404 everywhere. |
| `MCP_TOKEN_SECRET` | yes | ≥ 32 random chars (`openssl rand -base64 48`). Signs OAuth artifacts and confirm tokens. **Rotating it revokes every OAuth token and pending confirm token.** API keys are unaffected. |
| `MCP_OAUTH_REDIRECT_HOSTS` | no | Comma-separated exact hostnames. Defaults to the claude/chatgpt hosts above. Add Muse/Grok OAuth hosts here once known. |

Existing vars used as before: `DATABASE_URL`, `NEXTAUTH_SECRET`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `R2_*`, `NEXT_PUBLIC_SITE_URL`.

## Migration

`prisma/migrations/add_mcp.sql` is **NOT APPLIED** yet. The operator runs it by hand ([launch checklist](#launch-checklist-operator) step 1). It's idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), and its names and types match `prisma migrate diff` output for the schema:

- `StoreSettings."mcpEnabled" BOOLEAN NOT NULL DEFAULT false`
- `McpNonce` (`id` TEXT PK = sha256 hex of the token/code, `kind`, `tenantId`, `expiresAt` TIMESTAMP(3), `createdAt` TIMESTAMP(3) default now) with index `McpNonce_expiresAt_idx`

Both models are in `schema.prisma`, and `src/lib/mcp/tenant-flag.ts` uses the typed client. If the column is missing (Prisma `P2022`), the flag reads as off, the toggle explains that the migration is pending, and MCP stays closed. **But every other `storeSettings` query fails without the column too**, which is why the SQL must run before the deploy. `McpNonce` is global (not in `TENANT_SCOPED_MODELS`), because it's looked up by a globally unique hash.

**Nonce cleanup:** rows matter only until `expiresAt` (10 minutes for confirm tokens, 5 for codes). Once every 50 claims per instance, a fire-and-forget `deleteMany` removes rows that expired more than a day ago. No cron is needed. Expect a few hundred rows at most.

## Testing

- `npm run test:e2e`: integration tests for every admin route and every MCP tool, run against a throwaway local Postgres. See [FEATURE-VERIFICATION.md](FEATURE-VERIFICATION.md).

- `npm test`: vitest unit tests, mocks only, no DB. Covers:
  - **MCP core:** confirm-token canonicalization, expiry and forgery; the redirect allowlist; whitespace stripping; tenant isolation (a tenant-A credential can't produce a tenant-B context; smuggled `tenantId` args are ignored; no tool schema has a tenant field); registry conventions.
  - **Single-use credentials:** confirm-token double use, concurrent double claim (exactly one success), claim-before-side-effect, fail closed on a claim error, the status-unknown result naming the check tool, and the same cases for OAuth codes.
  - **Transport:** `initialize`/`tools/list` through the real SDK transport, read-only registry, the 401 discovery header, CORS, lenient Accept, 429s, the route segment config, and 405/OPTIONS.
  - **Admin routes** (`tests/admin/`): order refund/cancel/fulfill/resend-email, return refund, contact reply (escaping), Link Hub/email template, and the settings whitelist and landing-page house gate.
- `MCP_KEY=oss_live_… npx tsx scripts/mcp-smoke.ts` (optionally `MCP_URL=…`, `MCP_PATH_TOKEN=1`): runs `initialize` + `tools/list` against a running server. It never calls a tool.

## Tool list (93)

39 read, 23 write, 31 sensitive write. 24 are house-only.

### Dashboard, reports, settings, team (12)

| Tool | Tag | Flags | What it does |
|---|---|---|---|
| `dashboard_summary` | Read |  | Store dashboard: all-time order count, this calendar month's paid revenue (cents), active product count, number of low-stock tracked variants, and the 5 most recent orders. |
| `reports_sales` | Read |  | Paid-order sales for a date range: daily revenue and order counts, totals, average order value (cents), and % change vs the previous period of equal length. |
| `reports_products` | Read |  | All-time product performance: top 10 products by revenue and by units sold (cents), plus every tracked variant at or below its low-stock threshold. |
| `reports_customers` | Read |  | Customer summary: total customers, new this calendar month, returning this month (ordered this month but created earlier), and the top 10 customers by lifetime spend (cents). |
| `reports_discounts` | Read |  | Every discount code with type, value, usage count, active flag, and all-time revenue (cents) from PAID orders that used it, most used first. |
| `settings_get` | Read |  | Current store settings (name, branding, contact, live/Coming Soon status, return policy, notifications, social links, SEO) plus email branding (sender name, reply-to, email accent color, email logo). |
| `settings_update` | Sensitive write | idempotent | Change one or more store settings. |
| `settings_update_email_branding` | Sensitive write | idempotent | Change the branding used on all transactional emails: sender display name, reply-to address, button accent color, and logo. |
| `team_list` | Read |  | All admin users for this store, oldest first: id, name, email, role (SUPER_ADMIN, ADMIN, EDITOR), and active flag. |
| `team_add` | Sensitive write | open-world | Grant a person admin access as ADMIN or EDITOR and email them an admin sign-in link. |
| `team_update` | Sensitive write | idempotent | Change an admin's role (ADMIN/EDITOR) and/or deactivate or reactivate them (inactive admins cannot sign in). |
| `team_remove` | Sensitive write | destructive | Permanently delete an admin user from this store. |

### Orders (9)

| Tool | Tag | Flags | What it does |
|---|---|---|---|
| `orders_list` | Read |  | List orders newest first, with optional filters on status, payment status, date range, and a search over order number and customer email. |
| `orders_get` | Read |  | Get one order with its customer, line items, fulfillments (tracking), and returns. |
| `orders_set_note` | Write | idempotent | Replace the internal admin note on an order. |
| `orders_mark_delivered` | Write | idempotent | Set a SHIPPED or FULFILLED order to DELIVERED. |
| `orders_fulfill` | Sensitive write | open-world | Record a shipment for some or all line items with carrier and tracking number. |
| `orders_cancel` | Sensitive write | destructive, open-world | Cancel an order. |
| `orders_refund` | Sensitive write | destructive, open-world | Refund a paid order via Stripe, fully or partially, and email the customer a refund notice. |
| `orders_resend_confirmation` | Sensitive write | open-world | Email the order confirmation to the customer again. |
| `orders_check_tracking` | Write | open-world, idempotent | Query USPS/UPS for every SHIPPED order with a tracking number and set the ones the carrier reports delivered to DELIVERED. |

### Returns (8)

| Tool | Tag | Flags | What it does |
|---|---|---|---|
| `returns_list` | Read |  | List return requests newest first, optionally filtered by status. |
| `returns_get` | Read |  | Get one return with its order (status, payment status, total in cents, customer) and items (order line, price, variant). |
| `returns_set_note` | Write | idempotent | Replace the internal admin note on a return. |
| `returns_approve` | Sensitive write | open-world | Approve a REQUESTED return (status becomes APPROVED) and email the customer a return-approved notice. |
| `returns_reject` | Sensitive write | destructive, open-world | Reject a REQUESTED or APPROVED return (status becomes REJECTED, resolved now) and email the customer the rejection with the reason. |
| `returns_receive` | Sensitive write | open-world | Mark an APPROVED return as RECEIVED and email the customer that the items arrived. |
| `returns_set_status` | Write | idempotent | Overwrite a return's status field to any value with no transition checks. |
| `returns_refund` | Sensitive write | destructive, open-world | Refund a return: issues a Stripe refund of exactly `amount` cents to the customer's card (if the order was paid via Stripe and amount > 0), marks the return REFUNDED, sets the order's payment status to REFUNDED (amount >= order total, order status also REFUNDED) or PARTIALLY_REFUNDED, optionally restocks the returned items, and emails the customer a refund notice. |

### Products, categories, inventory (16)

| Tool | Tag | Flags | What it does |
|---|---|---|---|
| `products_list` | Read |  | List products sorted by slug, with optional search (name, slug, artisan name), status and category filters. |
| `products_get` | Read |  | Get one product with categories, images, options, and variants (each with inventory and variant images). |
| `products_create` | Sensitive write |  | Create a product with a single 'Default' variant at inventory 0. |
| `products_update` | Sensitive write | destructive | Update a product. |
| `products_delete` | Sensitive write | destructive, idempotent | Permanently delete a product with its variants, inventory, images, options, category/artisan links, reviews and add-ons. |
| `products_addons_get` | Read |  | List a product's add-ons (e.g. |
| `products_addons_set` | Write | idempotent | Enable or disable the laser monogram add-on for a product. |
| `products_generate_sku` | Read |  | Generate an unused SKU. |
| `products_upload_image` | Write | open-world | Download an image from a public https URL (JPEG, PNG, WebP or HEIC, max 10MB), convert it to WebP in full/medium/thumbnail sizes, store it in the store's image bucket, and generate alt text. |
| `categories_list` | Read |  | List all categories by position with parent, children, and product count. |
| `categories_get` | Read |  | Get one category with parent, children (with product counts), and its products (id, name, slug, status, price in cents). |
| `categories_create` | Write |  | Create a category. |
| `categories_update` | Write | idempotent | Update a category. |
| `categories_delete` | Sensitive write | destructive, idempotent | Permanently delete a category. |
| `inventory_list` | Read |  | List inventory records (one per variant), lowest quantity first, with variant and product. |
| `inventory_adjust` | Write |  | Set a variant's stock to an absolute quantity, or change it by a delta. |

### Customers, discounts, shipping, tax (18)

| Tool | Tag | Flags | What it does |
|---|---|---|---|
| `customers_list` | Read |  | List customers ordered by total spent, with optional search over email, first name, and last name. |
| `customers_get` | Read |  | Get one customer with addresses, internal notes and tags, full order history with line items, and live spend stats (cents). |
| `customers_update` | Write | idempotent | Replace a customer's internal notes and/or tags. |
| `discounts_list` | Read |  | List discount codes newest first. |
| `discounts_get` | Read |  | Get one discount by id or by code. |
| `discounts_generate_code` | Read |  | Return a random suggested code such as SAVE20. |
| `discounts_create` | Write |  | Create a discount code. |
| `discounts_update` | Write | idempotent | Change fields on a discount; omitted fields are left as they are. |
| `discounts_delete` | Sensitive write | destructive, idempotent | Permanently delete a discount code. |
| `shipping_zones_list` | Read |  | List all shipping zones in checkout priority order, each with its countries (ISO-2), US state regions, and rates. |
| `shipping_zone_create` | Write |  | Create a shipping zone, optionally with initial rates. |
| `shipping_zone_update` | Write | idempotent | Change a shipping zone's name, countries, regions, active flag, or priority position. |
| `shipping_zone_delete` | Sensitive write | destructive, idempotent | Permanently delete a shipping zone AND all of its rates. |
| `shipping_rate_create` | Write |  | Add a rate to a shipping zone. |
| `shipping_rate_update` | Write | idempotent | Change fields on a shipping rate; omitted fields are unchanged. |
| `shipping_rate_delete` | Sensitive write | destructive, idempotent | Permanently delete a shipping rate. |
| `tax_get` | Read |  | Get the store's tax settings: whether Stripe Tax is enabled, the default tax rate (percent, e.g. |
| `tax_update` | Write | idempotent | Update tax settings. |

### Artisans, KB, contact messages, communications (14)

| Tool | Tag | Flags | What it does |
|---|---|---|---|
| `artisans_list` | Read | house-only | List all artisan profiles, featured first then by name. |
| `artisans_get` | Read | house-only | Get one artisan's full profile, including all images and linked products. |
| `artisans_create` | Sensitive write | house-only | Create an artisan profile. |
| `artisans_update` | Sensitive write | house-only, idempotent | Update an artisan profile. |
| `artisans_delete` | Sensitive write | house-only, destructive | Permanently delete an artisan profile with its images and product links (the products themselves stay). |
| `kb_articles_list` | Read | house-only | List internal admin knowledge base articles (newest first) without their full content, plus all categories. |
| `kb_articles_get` | Read | house-only | Get one knowledge base article by slug, including its full markdown content. |
| `kb_articles_update` | Write | house-only, idempotent | Edit a knowledge base article's title, category, excerpt, markdown content, or read time. |
| `contact_messages_list` | Read |  | List contact-form messages newest first, optionally filtered by status. |
| `contact_message_get` | Read |  | Get one contact-form message in full, with its reply thread and internal notes. |
| `contact_message_update` | Write | idempotent | Set a contact message's status (UNREAD, READ, REPLIED, ARCHIVED) and/or replace its internal notes. |
| `contact_message_reply` | Sensitive write | open-world | Email a reply to the person who sent a contact message, from the store's address, quoting their original message. |
| `communications_list` | Read |  | Unified feed, newest first, of contact-form conversations and transactional emails sent by the store (order confirmations, shipping, refunds, etc.). |
| `email_log_get` | Read |  | Get one logged email by id, including recipient, subject, type, and its full HTML body (can be large). |

### Email template, landing page, Link Hub, Instagram (16)

| Tool | Tag | Flags | What it does |
|---|---|---|---|
| `email_template_get` | Read | house-only | Get the welcome email template sent to new subscribers: logo, colors, greeting, bodyHtml, socialLinks, signatureData, plus legacy fields. |
| `email_template_update` | Sensitive write | house-only, idempotent | Change the welcome email that new subscribers receive. |
| `email_template_upload_logo` | Write | house-only, open-world | Download an image from an https URL and store it as an email logo. |
| `email_template_upload_avatar` | Write | house-only, open-world | Download an image from an https URL and store it as the email signature avatar. |
| `landing_page_get` | Read | house-only | Get the public landing page content: hero, about and middle sections, footer, section visibility toggles, social links, and email signup form text. |
| `landing_page_update` | Sensitive write | house-only, idempotent | Change the public landing page. |
| `landing_page_upload_image` | Write | house-only, open-world | Download an image from an https URL, convert rasters to WebP (max 2000px wide; SVG stored as-is), and store it for a landing page image slot. |
| `linktree_settings_get` | Read | house-only | Get the Link Hub page settings: whether it is published, profile name, bio, image, custom slug, and colors. |
| `linktree_settings_update` | Sensitive write | house-only, idempotent | Change the Link Hub page profile and colors, or publish/unpublish it with isEnabled. |
| `linktree_links_list` | Read | house-only | List all Link Hub links in display order with id, title, url, description, icon, isEnabled, sortOrder and click count. |
| `linktree_link_create` | Sensitive write | house-only | Add an enabled link at the bottom of the Link Hub page. |
| `linktree_link_update` | Sensitive write | house-only, idempotent | Change a link's title, url, or description, or show/hide it with isEnabled. |
| `linktree_link_delete` | Sensitive write | house-only, destructive | Permanently delete a link and its click history. |
| `linktree_links_reorder` | Sensitive write | house-only, idempotent | Set the display order of Link Hub links. |
| `linktree_analytics` | Read | house-only | Link Hub clicks: all-time and last-7-days clicks per link, daily totals for the last 7 days, the 20 most recent clicks (time, referrer, link), and the all-time total. |
| `instagram_status` | Read | house-only | For each artisan, whether an Instagram account is connected, the Instagram user id, and when the access token expires (tokens last about 60 days). |


## Admin routes not covered

| Route | Why |
|---|---|
| `GET/POST /api/admin/instagram/connect`, `/callback`, `/disconnect` | Browser OAuth flows. Replaced by the read-only `instagram_status` (never returns tokens). |
| `GET /api/admin/orders?export=csv` | CSV download. `orders_list` returns the same data as JSON. |
| `PATCH /api/admin/discounts/[id]` (toggle active) | Covered by `discounts_update` with `isActive`. |
| `GET /api/admin/shipping/[id]` | Covered by `shipping_zones_list`, which returns every zone with its rates. |
| `POST /api/admin/upload`, `/landing-page/upload`, `/email-template/upload-*` (multipart) | Exposed as `*_upload_*` tools that take an https image URL, fetch it server-side (https only, public IPs only, redirects re-checked, 10 MB, 15 s), then run the same processing and R2 path. |
| KB create/delete | No such admin routes exist. |
| SKU registry page | Server component reading the DB directly. There is no API to wrap, and `products_list` covers it. |

## Known gaps

1. **No refresh tokens, and no per-token OAuth revocation.** Access tokens last 30 days. To cut access, deactivate the admin, turn the store switch off, or rotate `MCP_TOKEN_SECRET` (all stores). API keys revoke individually and immediately. A replayed auth code is refused, but the token issued from the first use is not revoked (RFC 6749 suggests revoking it; there's no token table).
2. **Rate limits are per instance** (see [Endpoints](#endpoints)). They don't hold globally across Vercel instances.
3. **No real-time push to other open admin screens** (spec §9). The app has no pub/sub layer.
4. **Image fetch DNS rebinding:** the hostname is resolved and checked, then fetched, so there is a small TOCTOU window.
5. **Activity filter:** Platform → Activity's action dropdown has no `mcp.*` entry, so MCP rows show under "All actions".
6. **Not run end-to-end against a live key.** `initialize`/`tools/list`, nonces and OAuth are covered in-process with mocks. A real-key smoke run (launch checklist step 5) needs the migration and a key minted in the database.
7. **Pre-existing admin issues** found during the refactor audit are listed in [MCP-REFACTOR-AUDIT.md](MCP-REFACTOR-AUDIT.md) with their status. Most were fixed on `fix/admin-mcp-full-verify`; the ones that need a product decision are listed there.

## Security fixes shipped with this branch (live on prod before it)

- **Settings mass-assignment:** `PUT /api/admin/settings` passed the whole body to the update, including `tenantId`. Both it and `settings_update` now write only `WRITABLE_SETTINGS_FIELDS` (`src/lib/admin-services/settings.ts`). `tenantId`, `id`, `mcpEnabled` and the timestamps are dropped.
- **Landing page:** any store's admin could overwrite the public Artisans Stories landing page through the API. `saveLandingPageSettings` and `uploadLandingPageImage` now return 403 unless the caller is the house tenant.
- **Email HTML injection:** contact-reply emails (sent and logged) and the public contact-form notification now HTML-escape user and admin text (`src/lib/escape-html.ts`).
