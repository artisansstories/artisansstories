# Simplify Storefront — Integration Playbook
**For:** Orange Slice Sport (and any tenant embedding a Simplify store)
**Audience:** Developer, AI agent, or store operator
**Updated:** 2026-06-28

---

## What this is
Simplify is a multi-tenant store platform. Your organization is a **tenant**: you get your
own products, your own branding, and a documented API to surface a fully white-labeled
"team store" inside YOUR site. Payments run through **Stripe** (hosted, trusted) and you are
the merchant of record — Simplify takes a small platform fee per sale and never holds your money.

You consume Simplify two ways:
1. **API** — pull your theme + products + create checkout sessions, render them as a
   first-class part of your site (a "Team Store" tab, interlaced featured products, etc.).
2. **Hosted branded store** — a ready-made storefront at your own subdomain, already
   themed to your brand, if you'd rather link out than build your own UI.

---

## 1. Your URLs

```
Storefront:   https://galarraga-baseball.artisansstories.com
Admin panel:  https://galarraga-baseball.artisansstories.com/admin/login
API base:     https://artisansstories.com   (API calls always use the root domain)
API docs:     https://artisansstories.com/api/v1/docs
```

---

## 2. Credentials

```
Tenant slug:  galarraga-baseball
API key:      issued by platform operator — see your integration page
Scopes:       store:read, checkout:create
```

Send the API key as a Bearer header on every request:
```
Authorization: Bearer <your-api-key>
```

Keys can be minted, rotated, and revoked by the platform operator at any time.
**Never ship a `checkout:create`-scoped key in client-side code** — proxy checkout calls through your backend. `store:read` GETs are CORS-enabled and safe to call from the browser.

---

## 3. Your admin panel

Your store admin is at `https://galarraga-baseball.artisansstories.com/admin/login`.

Login is via **magic link** — enter your email, check your inbox, click the link. No password.

Your admin includes:
- **Products** — create, edit, publish/unpublish, manage variants, images, add-ons
- **Orders** — view, fulfill, cancel, issue refunds
- **Customers** — view customer accounts and order history
- **Discounts** — create discount codes (% or $)
- **Shipping** — shipping zones and rates
- **Tax** — tax configuration
- **Returns** — return requests and approval workflow
- **Inventory** — stock levels
- **SKUs** — SKU registry
- **Communications** — email log, contact message inbox
- **Team** — manage admin users for your store
- **Settings** — store details, email branding, contact info

To get access, ask your platform operator to send you an invite (Platform → Tenant → Team → Invite Admin).

---

## 4. Email communications

All transactional emails to your customers are branded to your store:
- **Sender name:** your store name (configurable in Settings → Email)
- **Sender address:** `hello@artisansstories.com` (platform domain — shared)
- **Reply-to:** your configured reply-to address (optional, set in Settings → Email)

Configurable in your admin Settings → Email:
- Sender name shown to customers
- Reply-to address (customers who reply go here)
- CTA button color in emails
- Email logo (defaults to your store logo if not set)

Custom sending domain (e.g. `noreply@yourdomain.com`) is a future feature.

---

## 5. The API (v1)

Full machine-readable spec: `GET https://artisansstories.com/api/v1/openapi.json`
Interactive docs (Swagger UI): `https://artisansstories.com/api/v1/docs`

| Method | Path | Scope | Purpose |
|--------|------|-------|---------|
| GET | `/api/v1/store/theme` | store:read | Your branding (colors, fonts, logo, radius) |
| GET | `/api/v1/store/products` | store:read | Product list. Query: `category`, `q`, `tags`, `minPrice`, `maxPrice`, `sort`, `page`, `limit` |
| GET | `/api/v1/store/products/{slug}` | store:read | Full product detail (variants, options, images, addons) |
| GET | `/api/v1/store/products/featured` | store:read | Curated featured products |
| GET | `/api/v1/store/categories` | store:read | Category list with product counts |
| POST | `/api/v1/store/checkout/session` | checkout:create | Create a Stripe-hosted checkout → redirect buyer to `url` |
| GET | `/api/v1/store/orders/{id}` | store:read | Order status after checkout |

---

## 6. Quick start examples

```bash
export KEY="your-api-key"
export BASE="https://artisansstories.com"

# Get your branding
curl -s $BASE/api/v1/store/theme \
  -H "Authorization: Bearer $KEY" | jq

# List products
curl -s "$BASE/api/v1/store/products?limit=12&sort=featured" \
  -H "Authorization: Bearer $KEY" | jq

# Create a checkout session
curl -s -X POST $BASE/api/v1/store/checkout/session \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "lineItems": [{"productId":"<id>","variantId":"<vid>","quantity":1}],
    "successUrl": "https://yoursite.com/order-confirmed?session_id={CHECKOUT_SESSION_ID}",
    "cancelUrl":  "https://yoursite.com/store"
  }' | jq .url
# → redirect user to this URL
```

---

## 7. Stripe payments

Your store uses **Stripe Connect Standard**. You are the merchant of record:
- Customers pay you directly
- Simplify takes a 3% platform fee per sale
- Payouts go to your connected Stripe account
- Login at [dashboard.stripe.com](https://dashboard.stripe.com) to manage payouts and disputes

Stripe Connect onboarding is step 3 in your platform onboarding wizard. Your platform operator
can walk you through it or handle it directly.

---

## 8. Going live checklist

- [ ] Stripe Connect onboarded (`charges_enabled = true`)
- [ ] At least one published product
- [ ] Logo uploaded (Settings → Branding, or via onboarding wizard)
- [ ] Contact email set (Settings → Store)
- [ ] Platform operator flips go-live in the wizard

---

## 9. Support

Contact your platform operator (Orange Slice Sport / Simplify platform):
- **Wayne:** wayne@orangeslicesport.com
- **Mike:** mike@orangeslicesport.com
- **Platform console:** https://artisansstories.com/platform
