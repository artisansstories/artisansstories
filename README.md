# Artisans Stories — Simplify Platform

A multi-tenant e-commerce platform. **Artisans Stories** is tenant zero (the house store). Every other organization gets their own fully-branded store powered by the same codebase.

---

## What this is

Simplify is a white-label store platform built on artisansstories.com. Each merchant (tenant) gets:

- A branded storefront at `{slug}.artisansstories.com`
- A full store admin at `{slug}.artisansstories.com/admin/login`
- Isolated products, orders, customers, and inventory
- Stripe Connect payments (merchant-of-record, platform takes 3% fee)
- Transactional emails branded to their store
- A public API for embedding their store into their own site

Platform operators manage all tenants from `artisansstories.com/platform`.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS |
| Database | Neon PostgreSQL (serverless), Prisma ORM |
| Hosting | Vercel (auto-deploy on push to `main`) |
| DNS | Cloudflare (wildcard subdomain routing) |
| Payments | Stripe Connect Standard |
| Email | Resend (`hello@artisansstories.com`) |
| Storage | Cloudflare R2 (`artisansstories-images` bucket) |

---

## Architecture

### Multi-tenancy
- Every model in the DB has a `tenantId` column
- All Prisma queries go through a scoped client (`getTenantPrisma(tenantId)`) that injects `tenantId` automatically — cross-tenant data access is architecturally impossible
- Tenant zero (`tenant_artisans_stories`) is the house/platform-owner store (Artisans Stories)

### Subdomain routing
- `artisansstories.com` → tenant zero (Artisans Stories)
- `{slug}.artisansstories.com` → that tenant's store + admin
- Routing happens in `src/proxy.ts` via `parseTenantHost()` from `src/lib/tenant-host.ts`
- New tenants get DNS (Cloudflare CNAME) + Vercel domain auto-provisioned on creation

### Auth layers
- **Platform operators** (`as-platform-session` cookie): `artisansstories.com/platform/login` — magic link to `wayne@orangeslicesport.com` or `mike@orangeslicesport.com`
- **Tenant admins** (`as-admin-session` cookie): `{slug}.artisansstories.com/admin/login` — magic link, host-scoped per tenant
- **Customers** (`as-customer-session` cookie): magic link, scoped to their tenant

### House-only features
Landing Page, Knowledge Base, Artisans, Link Hub, and Email Template are exclusive to tenant zero (Artisans Stories). All other tenants see a focused store admin: Products, Orders, Customers, Discounts, Shipping, Tax, Returns, Inventory, SKUs, Settings, Communications, Team.

### Storefront notice banner
Admin → **Notice Banner** (`/admin/notice`, every store) posts a one-line notice across the top of the live storefront: message (≤ 280 chars, plain text), optional link (`https://…` or `/path`), style (Info / Success / Warning / Urgent), a **Show/Hide** switch, a start time (empty = immediately) and an optional expiration. Times are entered and shown in Pacific time and stored UTC. The status pill reads Live now / Scheduled / Expired / Hidden. The banner is evaluated on every request, so it appears and expires without a deploy or cache delay. It never shows on the Coming Soon page or in admin. Visitors can close it with ×, and it stays closed for them until the notice is edited. Editing needs ADMIN or SUPER_ADMIN. MCP: `notice_get`, `notice_set`, `notice_set_visibility`, `notice_clear` (see [docs/MCP.md](docs/MCP.md)). Table: `StoreNotice` (`prisma/migrations/add_store_notice.sql`).

---

### Analytics
- **Vercel Web Analytics + Speed Insights** load on every page (`src/app/layout.tsx`). Admin and platform page views are dropped before sending, and email-like query params are removed. To see data, turn on **Web Analytics** and **Speed Insights** in the Vercel project (Analytics and Speed Insights tabs) if they are not already on.
- **Google Analytics 4 / Meta Pixel, per store:** paste the IDs in Admin → **Settings → Analytics** (GA4 Measurement ID like `G-AB12CD34EF`; Pixel ID = 15–16 digits). The status line shows Active / Not set / Invalid. Bad formats are rejected on save (Settings API and MCP `settings_update`). Blank turns a tracker off. They load only on storefront pages (`StoreAnalytics` in the shop, cart, checkout, account, content-page and `/t/[slug]` layouts), never in admin. A legacy `TAX:{json}` value in `facebookPixelId` counts as not set.
- **Events** (`src/lib/analytics.ts`, a no-op when no ID is set): page_view/PageView on every navigation, view_item/ViewContent, add_to_cart/AddToCart, view_cart (GA4 only), begin_checkout/InitiateCheckout, and purchase/Purchase on `/checkout/success/[order]`. The purchase event has the order number, value, tax and shipping, and fires once per order. USD, product IDs, names and prices only; no customer PII. Tenant `/t/[slug]` stores use Stripe-hosted checkout, so they get begin_checkout but no purchase event yet.

## Local development

```bash
# 1. Clone
git clone https://github.com/artisansstories/artisansstories.git
cd artisansstories

# 2. Install
npm install

# 3. Configure environment
cp .env.example .env.local
# Fill in: DATABASE_URL, NEXTAUTH_SECRET, STRIPE_*, RESEND_API_KEY, R2_*, CLOUDFLARE_*, VERCEL_*

# 4. Push schema to DB
npx prisma db push
npx prisma generate

# 5. Run dev server
npm run dev
# → http://localhost:3000

# Dev subdomains (optional): add to /etc/hosts
# 127.0.0.1 galarraga-baseball.localhost
# Then access http://galarraga-baseball.localhost:3000
```

---

## Key URLs (production)

| URL | What |
|-----|------|
| `artisansstories.com` | House store (Artisans Stories) |
| `artisansstories.com/admin/login` | Artisans Stories admin |
| `artisansstories.com/platform/login` | Platform operator console |
| `artisansstories.com/api/v1/docs` | Swagger UI — public store API |
| `artisansstories.com/api/v1/openapi.json` | OpenAPI 3.1 spec |
| `{slug}.artisansstories.com` | Tenant storefront |
| `{slug}.artisansstories.com/admin/login` | Tenant admin |

---

## Deployment

Push to `main` → Vercel auto-deploys. No manual steps.

Schema changes: `npx prisma db push` against the shared Neon DB (production and local share the same DB — be careful).

Never run `prisma migrate dev` — use `prisma db push` only.

---

## Adding a new tenant

1. Log in to `artisansstories.com/platform` as a platform operator
2. Tenants → New Tenant → fill slug, name, description
3. DNS + Vercel domain auto-provisioned
4. Run the 7-step onboarding wizard (Branding → Stripe → Products → API Key → Integration → Go Live)
5. Invite tenant admin users: Tenant → Team → Invite Admin
6. Go-live flips `storeEnabled = true` (requires Stripe onboarded + ≥1 product)

---

## Repository structure

```
src/
  app/
    (public)/          # Public storefront (Artisans Stories home, shop, etc.)
    t/[slug]/          # Tenant white-label storefront (served via subdomain rewrite)
    admin/             # Tenant admin dashboard
    platform/          # Platform operator console
    api/
      v1/              # Public store API (products, checkout, orders)
      admin/           # Admin API routes
      platform/        # Platform operator API routes
      auth/            # Auth routes (admin, customer, platform magic links)
  lib/
    tenant-context.ts  # Tenant resolution (API key, admin session, host)
    tenant-host.ts     # Pure host parsing + subdomain URL building
    tenant-prisma.ts   # Scoped Prisma client (injects tenantId)
    tenant-features.ts # House-only feature gates
    email-branding.ts  # Per-tenant email branding resolver
    admin-auth.ts      # Admin session JWT
    platform-session.ts # Platform operator session JWT
  middleware.ts        # Next.js middleware (delegates to proxy.ts)
  proxy.ts             # Auth gates + subdomain routing
prisma/
  schema.prisma        # Single schema, all models have tenantId
scripts/               # Test/gate scripts (run with npx tsx scripts/*.ts)
docs/
  build-plans/         # Internal build plan documents
```
