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

## Pre-existing issues found during the audit (also on `main`, NOT fixed)

These were already on `main` and are out of scope for a behavior-parity refactor, so they're listed here rather than changed.

- Order cancel: if Stripe fails, the order is still marked CANCELLED and the payment needs manual cleanup (intentional on main).
- Fulfill does not check that orderItemIds belong to the order (stays inside the tenant via the scoped client).
- Order refund route: `refundAmount >= order.total` treats the final partial refund as partial (the MCP preview checks the refundable balance).
- Return refund with restock: if a variant has no inventory row, Stripe refunds and the DB is updated, then restock throws and the route returns 500 after the money has moved.
- The route doesn't block refunding an already REFUNDED return (the MCP preview does).
- latest_charge missing → passes undefined charge to stripe.refunds.create.
- returns/[id]/receive logs its email with type RETURN_APPROVED.
- Admin routes with no session: the route returns 500; src/proxy.ts returns 401 before the route is reached.
- upload: Promise.allSettled hides failed R2 writes ("throw if any failed" comment, but nothing throws).
- upload: alt text still goes through OpenRouter (OPENROUTER_API_KEY/Gemini).
- products/[id] PUT: artisan, options, variants, and image writes are not in a transaction, so a failure halfway leaves a partial update.
- generate-sku: getTenantPrismaForAdmin/req.json are outside try/catch.
- Tax settings stored as "TAX:" JSON in StoreSettings.facebookPixelId; saving tax overwrites a real Pixel ID (MCP preview warns; route doesn't).
- shipping/[id]/rates/[rateId] PUT/DELETE never check that the rate belongs to zone [id] (same tenant only).
- Rate PUT: price only forced to 0 when the same request sends condition FREE.
- Most admin routes return 500 (not 401) with no session, because getTenantPrismaForAdmin throws first. Dashboard returns 401.
- Non-numeric page/limit becomes NaN in customer/discount lists.
- Missing ids give 500 instead of 404 on customer PATCH, discount PATCH/DELETE, zone/rate PUT/DELETE.
- Team invite emails for non-house stores: addTeamMember posts to NEXT_PUBLIC_SITE_URL (house host), so the magic-link route resolves the house tenant, finds no admin, silently sends nothing, and still reports success. isInvite/inviterName/role are ignored.
- Artisan form wiping fields: PUT is a full replacement, and ArtisanForm.tsx never sends region, practicingSince, featuredPosts, or socialEmbedCode, so every UI save nulls them. MCP merges with the current record first.
- Unescaped HTML elsewhere: the public contact form notification email (src/app/api/contact/route.ts) puts visitor name/email/subject/message unescaped (anyone can submit). emailLogoHtml and the magic-link email put storeName unescaped.
- Contact-reply HTML logged before this fix is still unescaped in EmailLog.
- email-template and linktree API routes have no house gate (only the admin pages do). Every statement is tenant-scoped, so a non-house admin can only touch their own rows. The MCP tools are houseOnly.
- Email-template logo/avatar uploads go to a shared "email/" R2 prefix with no tenant in the path (timestamped keys, so nothing is overwritten).

### Explicitly deferred (per the hardening brief)

- **Tax settings stored in `facebookPixelId`**: saving tax settings overwrites a real Facebook Pixel ID.
- **Team invite emails for non-house stores**: they silently never arrive (see above).
- **Artisan form wiping fields**: `region`, `practicingSince`, `featuredPosts`, and `socialEmbedCode` are nulled on every UI save.
