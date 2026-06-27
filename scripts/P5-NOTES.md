# P5 — Theming guardrails + branded `/t/[slug]` storefront

This phase adds (1) validated theming guardrails, (2) a platform theme management
API, and (3) a fully white-labeled, server-rendered storefront at
`/t/[tenantSlug]` that renders any tenant's catalog in **their** brand.

---

## 1. Theming guardrails — `src/lib/theme.ts`

Branding is locked down so no tenant can ship an unreadable / off-brand
monstrosity. Everything written to a `TenantTheme` flows through
`validateThemeInput`.

**Allowlists**

- `FONT_ALLOWLIST` = `Inter`, `Cormorant Garamond`, `Anonymous Pro`,
  `Happy Monkey`, `Oregano`, `Poppins`, `Playfair Display`.
  Anything else is rejected. These are exactly the fonts the app actually loads
  (3 at root layout, 4 in the storefront font module).
- `RADIUS_ALLOWLIST` = `none`, `sm`, `md`, `lg` → mapped to px by
  `radiusToken()`: `none=0px`, `sm=4px`, `md=8px`, `lg=16px`.

**Validation rules (`validateThemeInput(input) → { ok, errors[], value }`)**

- Colors (`primaryColor` / `secondaryColor` / `accentColor`): strict
  `#rgb` / `#rrggbb` hex only (`isValidHex`), coerced to lowercase.
- Fonts (`fontHeading` / `fontBody`): must be in `FONT_ALLOWLIST`.
- `radius`: must be in `RADIUS_ALLOWLIST`.
- `logoUrl` / `faviconUrl`: optional. Must be an `http(s)://` URL, an
  `r2://` reference, or a root-relative asset path (`/...`). `null`/`""` clears.
  `javascript:`, `data:`, bare strings → rejected (`isValidAssetUrl`).
- **Unknown keys are rejected** — the theme surface area is closed.
- Missing keys fall back to `DEFAULT_THEME`, so `value` is always a complete,
  renderable theme. `value` is only safe to persist when `ok === true`.

**Helpers**

- `resolveTheme(row | null)` — merges a (possibly null) DB row over
  `DEFAULT_THEME`. Used for reads (DB rows are trusted, validated on write).
- `readableText(hex)` — WCAG-luminance pick of near-black/white foreground for
  text on a brand color (keeps primary buttons legible on any palette).
- `themeToCssVars(theme)` → the framework-free `--brand-*` vars (see §3).

---

## 2. Theme API

### Platform admin — `src/app/api/platform/tenants/[id]/theme/route.ts`

Same auth posture as the Stripe Connect route: a valid **admin session** that
belongs to the **platform-owner** tenant (`isPlatformOwner = true`).
`401` no session · `403` not platform owner · `404` unknown tenant.

- **GET** → `{ tenant, theme, isDefault }`. Returns the merged theme (or
  `DEFAULT_THEME` when no row exists; `isDefault: true` flags that).
- **PUT** → validates the body with `validateThemeInput`. On failure:
  `400 { error: "validation_failed", errors: [...] }`. On success: upserts the
  `TenantTheme` (raw `prisma` client — `TenantTheme` is **not** in
  `TENANT_SCOPED_MODELS`; keyed by `tenantId`) and returns the resolved theme.

```bash
# Read a tenant's theme (must be authenticated as a platform-owner admin)
curl -s http://localhost:3000/api/platform/tenants/<TENANT_ID>/theme \
  -H "Cookie: as-admin-session=<JWT>"

# Set a theme
curl -s -X PUT http://localhost:3000/api/platform/tenants/<TENANT_ID>/theme \
  -H "Cookie: as-admin-session=<JWT>" \
  -H "Content-Type: application/json" \
  -d '{
        "primaryColor": "#0f4c81",
        "secondaryColor": "#1b2a4a",
        "accentColor": "#e8b04b",
        "fontHeading": "Playfair Display",
        "fontBody": "Poppins",
        "radius": "lg",
        "logoUrl": "https://cdn.example.com/galarraga/logo.png"
      }'
```

A rejected body (e.g. `"fontHeading":"Comic Monstrosity"` or
`"primaryColor":"#zzz"`) returns `400` with a descriptive `errors[]`.

### Public storefront API — `GET /api/v1/store/theme` (from P3)

Already returns the full payload including `secondaryColor` and `radius`
(API-key authenticated, `store:read` scope). No change required in P5.

---

## 3. How the CSS variables flow

1. `themeToCssVars(theme)` produces the color + radius vars:
   `--brand-primary`, `--brand-secondary`, `--brand-accent`, `--brand-radius`
   (px), plus computed contrast colors `--brand-on-primary`,
   `--brand-on-accent`, `--brand-on-secondary`.
2. Fonts are framework-bound, so the **storefront layout** adds
   `--brand-font-heading` / `--brand-font-body` using
   `fontStack(name)` from `src/app/t/[tenantSlug]/brand-fonts.ts`, which maps an
   allowlist font name → a CSS font-family stack that references the loaded
   `next/font` variable (with web-safe fallbacks).
3. The layout sets all `--brand-*` vars as **inline style on a scoping
   `<div class="brand-scope">`**. CSS custom properties cascade to the whole
   subtree, so it's one brand per request with no global leakage (the root
   layout still owns `<html>`/`<body>`).
4. Components read the vars via inline `style={{ background: "var(--brand-primary)" }}`
   etc. for colors/radius, and Tailwind utility classes for responsive layout.
   **No Artisans colors are hardcoded** — the same components render any brand.

**Fonts loaded where:** root layout loads Geist (body default) + Anonymous Pro,
Happy Monkey, Oregano (as `--font-*` vars on `<html>`). The storefront font
module (`brand-fonts.ts`) loads the remaining four allowlist fonts (Inter,
Cormorant Garamond, Poppins, Playfair Display) via `next/font/google` and
applies their variables to the `brand-scope` wrapper via `BRAND_FONT_VARS`.

---

## 4. How `/t/[slug]` resolves + renders

```
src/app/t/[tenantSlug]/
  brand-fonts.ts               next/font loaders + fontStack() name→family map
  layout.tsx                   resolve tenant by slug, inject brand vars, header/footer
  page.tsx                     hero + featured strip + full product grid
  [productSlug]/page.tsx       branded product detail (gallery, options, add-to-cart)
  _components/
    BrandProductCard.tsx       presentational card (server) → links to detail
    ProductDetailClient.tsx    interactive buy box (client island)
```

- **Resolution** — `getStorefrontTenant(slug)` in `src/lib/storefront.ts` looks
  up the `Tenant` by slug with the **raw** prisma client (Tenant is global, not
  scoped) and merges its `TenantTheme` over defaults. It is wrapped in React
  `cache`, so the layout and the page each call it within one request without a
  second DB round-trip (layouts can't pass data to child pages). Returns `null`
  for missing **or `SUSPENDED`** tenants → callers `notFound()`.
- **Products** — fetched through the **tenant-scoped** client
  `getTenantPrisma(tenant.id)`, filtered to `status: "ACTIVE"`. Tenant isolation
  is enforced at the query layer, so a tenant can never render another tenant's
  products. The product detail page fetches by slug with `findFirst`
  (slug is unique per-tenant), `notFound()` if absent.
- **Render** — the hero uses a primary→secondary gradient; featured strip and
  catalog grid use `BrandProductCard`; the grid is mobile-first
  (`grid-cols-2 → md:grid-cols-3 → lg:grid-cols-4`). Every accent, button,
  badge and corner radius is brand-driven via the CSS vars above.

**Try it locally:** `npm run dev`, then visit `/t/artisans-stories`
(tenant zero seeded by `scripts/seed-tenant-zero.ts`). Point a new tenant's
theme via the PUT endpoint above and visit `/t/<their-slug>` — the same code
renders their brand.

---

## 5. Verification

```bash
npx tsc --noEmit              # clean
npm run build                 # succeeds (incl. /t routes)
npx tsx scripts/test-isolation.ts   # ISOLATION_PASS
npx tsx scripts/test-api.ts         # API_SMOKE_PASS
npx tsx scripts/test-theme.ts       # THEME_VALIDATION_PASS
```
