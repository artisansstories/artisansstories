# Simplify Storefront — Integration Playbook
**For:** Orange Slice Sport (and any tenant embedding a Simplify store)
**Audience:** an integrating developer or AI agent
**Status:** Proof-of-concept. API contract is stable; data is demo.

---

## What this is
Simplify is a multi-tenant store platform. Your organization is a **tenant**: you get your
own products, your own branding, and a documented API to surface a fully white-labeled
"team store" inside YOUR site. Payments run through **Stripe** (hosted, trusted) and you are
the merchant of record — Simplify takes a small platform fee per sale and never holds your money.

You consume Simplify two ways:
1. **API** — pull your theme + products + create checkout sessions, render them as a
   first-class part of your site (a "Team Store" tab, interlaced featured products, etc.).
2. **Hosted branded store** (optional) — a ready-made storefront at `/t/<your-slug>` already
   themed to your brand, if you'd rather link out than build your own UI.

---

## 1. Credentials (issued to you)
```
Base URL:    https://artisansstories.com        (POC host; will move to a platform domain)
Tenant slug: galarraga-baseball
API key:     oss_test_VZ1Zw3q9ffXbIAAkRdzjWRIdsKTPRYJQ     (demo/test key — store securely)
Scopes:      store:read, checkout:create
Hosted store: https://artisansstories.com/t/galarraga-baseball
```
Send the key as a Bearer header on every request:
```
Authorization: Bearer oss_test_VZ1Zw3q9ffXbIAAkRdzjWRIdsKTPRYJQ
```
Keys can be revoked/rotated at any time. Never ship the key in client-side code for
`checkout:create` — proxy checkout calls through your backend. `store:read` GETs are
CORS-enabled and safe to call from the browser.

---

## 2. The API (v1)
Full machine-readable spec: `GET /api/v1/openapi.json` · Interactive docs (Swagger UI): `/api/v1/docs`

| Method | Path | Scope | Purpose |
|--------|------|-------|---------|
| GET | `/api/v1/store/theme` | store:read | Your branding (colors, fonts, logo, radius) — apply it so the store matches your site DNA |
| GET | `/api/v1/store/products` | store:read | Product list. Query: `category, q, tags, minPrice, maxPrice, sort, page, limit` |
| GET | `/api/v1/store/products/{slug}` | store:read | Full product detail (variants, options, images, addons) |
| GET | `/api/v1/store/products/featured` | store:read | Curated featured products for tasteful interlaced placements |
| GET | `/api/v1/store/categories` | store:read | Category list with product counts |
| POST | `/api/v1/store/checkout/session` | checkout:create | Create a Stripe-hosted checkout session → redirect the buyer to `url` |
| GET | `/api/v1/store/orders/{id}` | store:read | Order status after checkout |

### Example: render your Team Store tab
```bash
# 1. Theme — apply these to your store section
curl -s https://artisansstories.com/api/v1/store/theme \
  -H "Authorization: Bearer $KEY"
# -> { theme:{ primaryColor:"#ff7a18", secondaryColor:"#0b3d91", accentColor:"#ffd23f",
#              fontHeading:"Poppins", fontBody:"Inter", radius:"lg" }, storeName, storeDescription }

# 2. Products
curl -s "https://artisansstories.com/api/v1/store/products?limit=12&sort=featured" \
  -H "Authorization: Bearer $KEY"
# -> { products:[{id,slug,name,price,images,variantId,...}], total, page, totalPages, categories }

# 3. Product detail
curl -s https://artisansstories.com/api/v1/store/products/team-jersey \
  -H "Authorization: Bearer $KEY"
```
Prices are integer **cents** (e.g. `5499` = $54.99). Apply the `theme` values as CSS variables
so the store inherits your brand — that's how it becomes a first-class citizen of your site.

### Example: tasteful interlaced placement ("the ad that isn't an ad")
```bash
curl -s "https://artisansstories.com/api/v1/store/products/featured?limit=2" \
  -H "Authorization: Bearer $KEY"
```
Drop one of these into a content page (e.g. next to a "helmet safety" article) styled like the
rest of your page — not a banner ad.

---

## 3. Checkout (Stripe-hosted redirect)
Call this from YOUR backend (keeps the key server-side):
```bash
curl -s -X POST https://artisansstories.com/api/v1/store/checkout/session \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{ "variantId": "<variant-id-from-product>", "quantity": 1 }],
    "successUrl": "https://your-site.com/store/thanks?session={CHECKOUT_SESSION_ID}",
    "cancelUrl":  "https://your-site.com/store/cart"
  }'
# -> { ok:true, mode:"connect_redirect", url:"https://checkout.stripe.com/..." }
```
Redirect the buyer to `url`. They pay on Stripe (trusted, branded with your org once your
Stripe Connect onboarding is complete), then return to your `successUrl`.

**Prerequisite:** your tenant must have completed Stripe Connect onboarding. If not, this
endpoint returns `409 { ok:false, error:"tenant_stripe_not_onboarded", onboardingRequired:true }`.
Onboarding is a one-time ~5-minute Stripe flow (reuses your existing Orange Slice Sport Stripe
Connect account where possible). Server never trusts client-sent prices — amounts are computed
from the database.

---

## 4. Option B — just link to the hosted store
If you don't want to build UI yet, point your "Team Store" tab at:
```
https://artisansstories.com/t/galarraga-baseball
```
It's already themed to your brand (orange/navy/yellow, Poppins headings) with product grid +
product detail pages. Later, you can put your own domain in front of it via Cloudflare (a
roadmap item, not part of this POC).

---

## 5. Errors & limits
- `401` missing/invalid/revoked key · `403` key lacks the required scope · `404` not found in your tenant
- `409` checkout when Stripe not onboarded · `429` rate limited (120 req/min; honor `Retry-After`)
- Errors are JSON: `{ error: "<machine_code>", message?: "<human>" }`

## 6. Isolation guarantee
Every request is scoped to YOUR tenant at the database layer. You cannot see or touch another
tenant's data, and they cannot see yours — enforced automatically on every query, verified by
an automated cross-tenant test in CI.

---
*Questions / key rotation / Stripe onboarding link: contact the Simplify platform admin.*
