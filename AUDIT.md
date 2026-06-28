# Platform Audit — 2026-06-28

Conducted post-build-day audit covering tenant isolation, routing, auth, email, storefront, and UX gaps.

---

## Critical (fix before any non-house tenant goes live)

### C1 — Customer magic link uses NEXT_PUBLIC_SITE_URL (wrong subdomain)
**File:** `src/app/api/auth/customer/magic-link/route.ts:111`
```ts
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
const magicLink = `${siteUrl}/api/auth/customer/verify?token=...`;
```
**Problem:** A customer on `galarraga-baseball.artisansstories.com` who clicks "Sign in" gets a magic link pointing to `artisansstories.com/api/auth/customer/verify`. The verify endpoint sets the `as-customer-session` cookie scoped to the *root* domain, not the subdomain — customer ends up with a session on the wrong host.  
**Fix:** Use `originFromRequest(request)` from `@/lib/tenant-host` to build the magic link URL, same as admin magic link already does.

### C2 — Checkout and /account pages don't show tenant branding
**Files:** `src/app/checkout/layout.tsx:68`, `src/app/account/layout.tsx`, `src/app/account/login/page.tsx:134`
All hardcode `/logo-color.png` (Artisans Stories logo). A Galarraga customer checking out at `galarraga-baseball.artisansstories.com` sees the Artisans Stories logo in the checkout header and account pages.  
**Fix:** Same pattern as admin login — resolve tenant from host, pass logo/name as props.

### C3 — Invite admin email says "Powered by Artisans' Stories"
**File:** `src/app/api/platform/tenants/[id]/invite-admin/route.ts:71`
```html
<p ...>Powered by Artisans' Stories</p>
```
The email inviting someone to the Galarraga admin has "Powered by Artisans' Stories" in the footer. Should say "Powered by Simplify" or be removed.  
**Fix:** Replace with "Powered by Simplify" or remove the footer line entirely.

---

## High (fix soon)

### H1 — API docs title hardcoded to "Artisans Stories"
**Files:** `src/app/api/v1/docs/route.ts:12`, `src/app/api/v1/openapi.json/route.ts:42`
```ts
title: "Artisans Stories — Storefront API"
```
When a tenant hits `/api/v1/docs` via their subdomain (or via their API key), the docs say "Artisans Stories". Minor but confusing.  
**Fix:** Make the API title resolve from tenant context, or use a generic "Simplify Storefront API v1".

### H2 — LinktreeClient still shows Artisans Stories logo in preview
**File:** `src/app/admin/(protected)/linktree/LinktreeClient.tsx:359`
```tsx
<Image src="/logo-color.png" alt="Logo" .../>
```
This is the house-only Link Hub page — correctly gated behind `isHouseTenant`. The logo is correct for house use. **No action needed** unless the Link Hub is ever opened to tenants.

### H3 — No tenant scoping on /account routes
**Files:** `src/app/account/*`
The customer account pages (`/account/orders`, `/account/addresses`, etc.) resolve the customer session but don't resolve the tenant from the host. A customer session created on `galarraga-baseball.artisansstories.com` could in theory access `/account` on `artisansstories.com` and see their Galarraga orders in the Artisans Stories account UI.  
**Fix:** Add host-based tenant resolution to the `/account` layout and verify the customer's `tenantId` matches before rendering data.

### H4 — Customer session cookie domain scope
**File:** `src/lib/account-session.ts` (check cookie domain setting)
The `as-customer-session` cookie should be host-scoped (no domain attribute) so it stays on the tenant subdomain, same fix applied to `as-admin-session` in T2. Verify this is the case — if it's set with `domain: ".artisansstories.com"` it could bleed across tenants.

### H5 — StoreSettings `singleton` ID assumption for tenants
**Multiple files** — many routes do:
```ts
prisma.storeSettings.findUnique({ where: { id: "singleton" } })
```
This works because the scoped Prisma client injects `tenantId`. But if `storeSettings` ever has a different row ID for a tenant, this breaks. The seed for Galarraga should have created a `singleton` settings row — verify it exists.

---

## Medium (backlog)

### M1 — No tenant-aware storefront pages for checkout/account
The checkout flow at `/checkout` and the account flow at `/account` are currently Artisans-Stories-specific UI. Tenants on subdomains will have these pages but they'll show AS branding, fonts, and colors. Full tenant theming on these pages (use `TenantTheme.primaryColor`, fonts, etc.) isn't done.

### M2 — `/t/{slug}` paths still accessible
The old `/t/galarraga-baseball` path still works (it's the rewrite target for the subdomain). This isn't broken but could cause duplicate-content SEO issues. Consider redirecting `/t/{slug}/*` to `{slug}.artisansstories.com/*`.

### M3 — Platform API docs title (`/api/v1/docs`) not tenant-aware
See H1 above — medium priority if tenants access it directly, high if they share it with their developers.

### M4 — No per-tenant Stripe webhook endpoint
All Stripe webhooks hit the single `/api/webhook/stripe` endpoint. This works because the webhook payload contains `account` (the connected account ID) which maps to a tenant. Verify the webhook handler correctly routes events by `account` and doesn't fall through to house-tenant logic for Connect events.

### M5 — R2 bucket is shared across all tenants
All tenant uploads go to the same R2 bucket (`artisansstories-images`) with key prefixes `tenants/{id}/...`. This is correct and safe but means a single R2 credentials compromise exposes all tenant assets. Future: per-tenant bucket or at minimum per-tenant IAM.

### M6 — No email unsubscribe mechanism for tenant customers
The `subscribe` route (email capture) and welcome email are house-only, but tenant transactional emails have no unsubscribe link. Required by CAN-SPAM for marketing emails. Transactional emails (order confirmations etc.) are exempt but should include a physical address.

### M7 — Onboarding wizard step 1 "Create store" doesn't validate slug uniqueness in UI
The API rejects duplicate slugs, but the UI doesn't show a real-time availability check. Operator sees a generic error after form submit. Add inline slug availability check.

### M8 — No tenant deletion of customer PII on hard-delete
`A3+A4` built hard-delete with a txn sweep over `TENANT_SCOPED_MODELS`. Verify the sweep includes `Customer`, `CustomerAddress`, `Order`, `OrderItem` — i.e., all PII is deleted, not just left as orphans. GDPR concern.

---

## Low / Polish

### L1 — README was Next.js boilerplate
**Fixed in this commit.** Now documents the platform properly.

### L2 — Build plan docs in repo root
Files like `ONBOARDING_PLAN.md`, `PLATFORM_SEPARATION_PLAN.md`, `OPERATOR_AUDIT_PLAN.md`, `UPLOADS_PLAN.md` and `scripts/P*-NOTES.md` are internal build artifacts cluttering the root. Moved to `docs/build-plans/` in this commit.

### L3 — INTEGRATION_PLAYBOOK.md was stale
Referenced `/t/galarraga-baseball` instead of the subdomain, said "POC host". **Fixed in this commit.**

### L4 — Integration page showed /t/{slug} URL
`src/app/platform/(protected)/tenants/[id]/integration/page.tsx` showed the old rewrite path. **Fixed in this commit** to use `tenantBaseUrl(tenant.slug)`.

### L5 — API docs Swagger title says "Artisans Stories"
See H1 — polish-level if low traffic, bump to High if tenants share it with developers.

### L6 — No "back to store" link in admin
Tenant admins on `{slug}.artisansstories.com/admin` have no quick link to open their storefront in a new tab. Small UX gap.

### L7 — Platform activity log has no date range filter
`/platform/activity` shows all audit log events with no filter. Fine now with one tenant, will become unusable with 10+.

---

## Already known / tracked

- **C1** (customer magic link) — flagged by Opus during E1 build as "pre-existing cookie-host concern outside this task's scope"
- **R2 key exposure** — was in git history (fixed: code uses env vars, key should be rotated by Wayne at Cloudflare)
- **claude-nayib Anthropic key** — exhausted credits during build, needs top-up at console.anthropic.com
- **Contact email** — was hardcoded to anna@ for all tenants. Fixed in commit `1e944db`.
- **Stripe Tax $0 bug** — fix committed but not verified with real CA checkout (from 2026-06-04 notes)
