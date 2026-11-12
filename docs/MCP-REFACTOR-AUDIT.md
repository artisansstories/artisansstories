# Regression audit: `/api/admin/*` → `src/lib/admin-services/*`

The `feat/mcp-server` branch moved the logic of 61 existing admin route handlers into shared services that the MCP tools also call, and added 3 new routes. Each route's handler on `main` (`git show main:<path>`) was compared with the new route plus its service, on these dimensions: auth and role gates (including order), tenant scoping, status codes, response JSON shape (field names, nesting, null vs missing), side effects and their order (Stripe, email, inventory logs, R2), and the error strings the admin UI shows.

## Summary

| Outcome | Routes |
|---|---|
| Identical to `main`, no change | 54 |
| Regression found and fixed back to `main` behavior | 3 (`products/[id]`, `categories/[id]`, `upload`) |
| Identical to `main`, then deliberately changed as a security fix | 4 (`settings`, `landing-page/settings`, `landing-page/upload`, `contact/[id]/reply`) |
| New in this branch (reviewed, nothing on `main` to compare) | 3 (`mcp`, `mcp/keys`, `mcp/keys/[keyId]`) |
| **Total** | **64** |

None of the refactored routes changed auth, tenant scoping, response shape, or side-effect order. All three regressions were ordering differences on error paths.

Route-level tests with mocked prisma cover the money and email paths: `tests/admin/orders-{refund,cancel,fulfill,resend-email}.test.ts`, `returns-refund.test.ts`, `contact-reply.test.ts`, plus `site-linktree-email.test.ts` and `security-fixes.test.ts`.

Paths are relative to `src/app/api/admin/`. "Identical?" means identical to `main` before this hardening pass.

## Orders

| Route | Methods | Identical? | What differed | What we did |
|---|---|---|---|---|
| `orders` | GET | Y | - | none |
| `orders/[id]` | GET | Y | - | none |
| `orders/[id]/cancel` | POST | Y | - | none; route test added |
| `orders/[id]/deliver` | POST | Y | - | none |
| `orders/[id]/fulfill` | POST | Y | - | none; route test added |
| `orders/[id]/note` | PATCH | Y | - | none |
| `orders/[id]/refund` | POST | Y | - (the service passes a trailing Stripe options argument, undefined from the route) | none; route test added |
| `orders/[id]/resend-email` | POST | Y | - | none; route test added |
| `orders/check-tracking` | POST | Y | - | none |

## Returns

| Route | Methods | Identical? | What differed | What we did |
|---|---|---|---|---|
| `returns` | GET | Y | - | none |
| `returns/[id]` | GET, PUT | Y | - | none |
| `returns/[id]/approve` | POST | Y | - | none |
| `returns/[id]/reject` | POST | Y | - | none |
| `returns/[id]/receive` | POST | Y | - | none |
| `returns/[id]/status` | PATCH | Y | - | none |
| `returns/[id]/refund` | POST | Y | - (the service takes optional Stripe request options, but the route passes undefined, so the Stripe call is the same) | none; route test added |

## Products, categories, inventory, uploads

| Route | Methods | Identical? | What differed | What we did |
|---|---|---|---|---|
| `products` | GET, POST | Y | - | none |
| `products/[id]` | GET, PUT, DELETE | N | PUT read the body before the existence check, so a missing product with an unparseable body returned 500 instead of 404 "Product not found" | fixed: on a body parse error, check existence and return 404, otherwise the same 500 |
| `products/[id]/addons` | GET, PUT | Y | - | none |
| `products/generate-sku` | POST | Y | - | none |
| `categories` | GET, POST | Y | - | none |
| `categories/[id]` | GET, PUT, DELETE | N | PUT had the same body-before-existence ordering as products/[id] (500 instead of 404 "Category not found") | fixed: same parse-error fallback |
| `inventory` | GET | Y | - | none |
| `inventory/[id]` | PATCH | Y | - | none |
| `upload` | POST | N | The file type check moved after reading the file into memory, so a read error on a wrong-type file returned 500 instead of 400 | fixed: type check (checkProductImage, size 0) runs before reading; the full check still runs in processProductImage |

## Customers, discounts, shipping, tax, dashboard, reports

| Route | Methods | Identical? | What differed | What we did |
|---|---|---|---|---|
| `customers` | GET | Y | - | none |
| `customers/[id]` | GET, PATCH | Y | - | none |
| `discounts` | GET, POST | Y | - (P2002 → 409 moved into service; same status/body) | none |
| `discounts/[id]` | GET, PUT, PATCH, DELETE | Y | - (P2002 → 409 / P2025 → 404 moved into service; same status/body) | none |
| `discounts/generate-code` | GET | Y | - | none |
| `shipping` | GET, POST | Y | - | none |
| `shipping/[id]` | GET, PUT, DELETE | Y | - | none |
| `shipping/[id]/rates` | POST | Y | - | none |
| `shipping/[id]/rates/[rateId]` | PUT, DELETE | Y | - | none |
| `tax` | GET, PUT | Y | - | none |
| `dashboard` | GET | Y | - | none |
| `reports/sales` | GET | Y | - | none |
| `reports/products` | GET | Y | - | none |
| `reports/customers` | GET | Y | - | none |
| `reports/discounts` | GET | Y | - | none |

## Artisans, KB, contact, communications, team

| Route | Methods | Identical? | What differed | What we did |
|---|---|---|---|---|
| `artisans` | GET, POST | Y | - | none |
| `artisans/[id]` | GET, PUT, DELETE | Y | - | none |
| `kb/articles` | GET | Y | - | none |
| `kb/articles/[slug]` | GET, PUT | Y | - | none |
| `contact` | GET | Y | - | none |
| `contact/[id]` | PATCH | Y | - | none |
| `contact/[id]/reply` | POST | Y | - | deliberate: user/admin text is HTML-escaped in the sent and logged email HTML (security fix, section 3); route test added |
| `communications` | GET | Y | - | none |
| `email-log/[id]` | GET | Y | - | none |
| `team` | GET, POST | Y | - | none |
| `team/[id]` | PUT, DELETE | Y | - | none |

## Email template, landing page, Link Hub, settings, MCP admin

| Route | Methods | Identical? | What differed | What we did |
|---|---|---|---|---|
| `email-template` | GET, POST | Y | - | none |
| `email-template/upload-avatar` | POST | Y | - | none |
| `email-template/upload-logo` | POST | Y | - | none |
| `landing-page/settings` | GET, POST | Y | - (main had no API-level house gate either; any store admin could overwrite the global singleton) | deliberate: POST now 403 unless house tenant (security fix, section 3) |
| `landing-page/upload` | POST | Y | - | deliberate: house gate added for consistency with landing-page/settings |
| `linktree/analytics` | GET | Y | - | none |
| `linktree/links` | GET, POST, PUT, DELETE | Y | - | none |
| `linktree/links/reorder` | POST | Y | - | none |
| `linktree/settings` | GET, POST | Y | - | none |
| `settings` | GET, PUT, PATCH | Y | - (main already mass-assigned the body; this branch made it worse because mcpEnabled is now a column, so any admin role could switch MCP on and skip the ADMIN/SUPER_ADMIN gate) | deliberate: writable fields whitelisted in the service (security fix, section 3) |
| `mcp` | GET, PATCH | n/a (new) | - | reviewed: live AdminUser lookup, 403 unless SUPER_ADMIN/ADMIN, tenant-scoped |
| `mcp/keys` | POST | n/a (new) | - | reviewed: only mcp:admin/mcp:read, minted for admin.tenantId, 201 |
| `mcp/keys/[keyId]` | DELETE | n/a (new) | - | reviewed: updateMany scoped by id + tenantId + mcp scope; another store's key → 404 |

## Deliberate behavior changes on `feat/policy-autonomy` (owner decisions)

Same shared-service pattern: each change applies to the route, the admin UI and the MCP tool together. Auth and tenant scoping are unchanged.

| Route | Methods | Change |
|---|---|---|
| `orders/[id]/cancel` | POST | Money first; Stripe failure → 502 `{blocked, retrySafe}` with nothing cancelled; restock in the same transaction as the status change; delivered/shipped/partly shipped → 409 with the next step; partly refunded → refunds the remaining balance. Response adds `refundedAmount`, `stripeRefundId`, `restocked`. Idempotency key now includes the order version. |
| `returns` | POST (new) | Admin-created return for shipped items (`returns_create`). |
| `returns/[id]/receive` | POST | Email logged as `RETURN_RECEIVED`. |
| `team`, `team/[id]` | POST, PUT, DELETE | Owner protection and the last-active-owner rule (locked transaction). SUPER_ADMIN can now grant SUPER_ADMIN and change another owner. Self-actions refused with 403 (role, deactivate) or 400 (remove, as before). |
| `settings` | PUT | `storeEnabled` changes need ADMIN/SUPER_ADMIN (live role); the route now reads the acting admin (401 if gone). |
| `categories/[id]` | PUT | Loops refused (400), under a lock. |
| `upload` | POST | `altText` is never null: AI text or the fallback, plus `altTextSource`. Optional `position` form field. |
| `products`, `products/[id]` | POST, PUT | Images saved without alt text get the fallback. |
| `products/[id]/alt-text` | POST (new) | Regenerate fallback alt text. |
| `instagram/status` | GET (new) | Status for the artisan edit page's Connect panel. |

## Pre-existing issues found during the audit: status after `fix/admin-mcp-full-verify`

These were on `main`. Each is now either fixed (with e2e coverage, see [FEATURE-VERIFICATION.md](FEATURE-VERIFICATION.md)) or listed as needing a product decision.

| Issue | Status |
|---|---|
| Order cancel: Stripe failure still marks the order CANCELLED | **Decided and fixed (`feat/policy-autonomy`):** money first. A failed refund/void cancels nothing, returns `retrySafe: true`, and the retry can't refund twice. Status + restock run in one transaction afterwards. |
| Fulfill doesn't check that orderItemIds belong to the order | Fixed (400). CANCELLED/REFUNDED orders are refused too. |
| Order refund: final partial refund treated as partial | Fixed: full vs partial is read from the charge after the refund. |
| Return refund with restock 500s after money moved (no inventory row) | Fixed: the row is created with a log entry (a deleted variant is skipped with a warning), all DB writes are in one transaction, and the response says honestly what happened. |
| Route allowed refunding an already REFUNDED return | Fixed (409 before Stripe). |
| `latest_charge` missing → undefined charge | Fixed: refunds are created by `payment_intent`. |
| `returns/[id]/receive` logs its email as RETURN_APPROVED | **Fixed:** `EmailLogType.RETURN_RECEIVED` (`prisma/migrations/add_email_log_return_received.sql`, run before deploy). Old rows unchanged. |
| Admin routes return 500 with no session | Fixed in `src/lib/admin-api.ts` (`authErrorResponse`), plus a sweep test over all 100 handlers. |
| upload: `Promise.allSettled` hides failed R2 writes | Fixed (502). |
| upload: alt text goes through OpenRouter | **Decided:** keep OpenRouter, no new provider. It can't block anything now: 8 s timeout, fallback "<product> — image <n>", warning logged, regenerate later (route, MCP tool, product-form button). |
| products/[id] PUT not transactional | Fixed (`$transaction`); create and artisan update are transactional too. |
| generate-sku outside try/catch | Fixed. |
| Tax settings stored in `facebookPixelId` (and on the `singleton` row) | Fixed: `StoreSettings.taxSettings` on each store's own row; `prisma/migrations/add_store_tax_settings.sql` moves the data. |
| Rate PUT/DELETE don't check the rate belongs to zone `[id]` | Fixed (404). |
| Rate PUT price forced to 0 only when the request sends FREE | Fixed: a rate that is FREE after the update is 0. |
| Non-numeric page/limit → NaN | Fixed (defaults). |
| Missing ids → 500 | Fixed (404) across customers, discounts, shipping, returns, orders, Link Hub, artisans and contact. |
| Team invites for non-house stores silently not sent | Fixed (`src/lib/admin-invite.ts`): store host and branding; `invite.sent` is reported truthfully. |
| Artisan form nulls four fields | Fixed: PUT keeps fields the body leaves out; an explicit null clears them. |
| Unescaped HTML in emails | Fixed: contact reply, `emailLogoHtml`, the magic-link email. The public contact form was already escaped. |
| Contact-reply HTML logged before the escape fix | **Decision needed:** clean up historical `EmailLog` rows or leave them (data only, never re-sent). |
| email-template / Link Hub / KB / artisans / Instagram APIs had no house gate | Fixed (403 for other stores, matching the nav and MCP). |
| Email-template uploads in a shared `email/` prefix | Fixed: `tenants/<id>/email/`. |

### Found during e2e verification (also fixed)

- Admin sessions (30 days) kept the role and tenant they were issued with. A deactivated or deleted admin could still use the API, and team routes trusted the session's role. Now checked live on every request.
- `POST /api/admin/instagram/disconnect` with no `artisanId` cleared every artisan's Instagram tokens.
- Instagram OAuth `state` was not bound to the browser (CSRF). It now uses a single-use nonce cookie.
- Admin artisan responses included `igAccessToken`.
- Product create/update and category parent accepted another store's ids.
- Refund amount 0, negative or garbage meant a FULL refund, in the API and on the order page.
- Fulfill re-shipped CANCELLED orders.
- Contact reply was marked REPLIED even when the email failed.
- `GET /api/admin/landing-page/settings` had no auth.
- Link Hub update/delete reported success for unknown or other-store ids.
- Public link clicks could be logged under the wrong store.
- `POST /api/admin/upload` with a deleted admin's session wrote to the house prefix.

### Product decisions (2026-11-11), now implemented on `feat/policy-autonomy`

- Order cancel when Stripe fails: money first; nothing changes on failure; retry-safe.
- Cancelling a DELIVERED or shipped order: refused, pointing to `returns_create` / "Create return" (new). Partly shipped: refused, pointing to a return plus `orders_refund`. Partly refunded and unshipped: refunds the remaining balance and restocks.
- Owner protection: nobody acts on themselves; only SUPER_ADMINs touch SUPER_ADMINs or grant it; API keys (ADMIN) never can; at least one active SUPER_ADMIN always remains (locked, concurrency-tested). The Team page hides what would be refused.
- Publishing (`storeEnabled`) needs ADMIN or SUPER_ADMIN. EDITORs keep content editing; the switch is disabled for them.
- RETURN_RECEIVED email type (schema change, migration file).
- Category loops (A → B → A and longer) are refused.
- OpenRouter alt text kept, with a fallback and regenerate.
- The Instagram connect flow has an entry point on the artisan edit page; `instagram_status` links to it.

### Still open (not part of this decision set)

- Historical unescaped `EmailLog` HTML (data only, never re-sent).
- A deliberate second identical partial refund after the first was recorded creates a second refund. That is correct for intentional repeats, but there is no "are you sure".
- Amount-0 return refunds mark the order PARTIALLY_REFUNDED.
- Product revenue report counts items from all orders, including unpaid and refunded ones.
- MCP can't clear `practicingSince` or `featuredPosts` (null means "unchanged" in MCP).
- Discounts accept product and category ids from another store (they match nothing).
- Found while doing this: the order **refund** route has the same retry weakness the cancel fix addresses. Its Stripe idempotency key doesn't change after a failed attempt, so for 24 hours real Stripe replays the cached error to an identical retry. Cancel works around this by noting the failed attempt (which moves the order version). The refund route says "nothing was changed" on failure, so it was left alone. That note also means a refund racing a cancel that just failed can see the order move and report `alreadyRecorded` without updating the payment status. The Stripe webhook (`charge.refunded`) corrects that.
