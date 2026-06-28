# Store Onboarding — the "Process Train" (Platform Operator)

**Status:** build-ready blueprint. **Scope:** architecture + execution plan only; no code in this doc.
**Owner intent (authoritative, Wayne):** "Onboarding instructions — Stripe, API keys, everything for setting up a store — as a *process train* under platform admin, for complete frictionless onboarding, as easy as possible."

**One-line answer:** a resumable **multi-step wizard at `/platform/onboarding/[tenantId]`** that orchestrates the existing `/api/platform/**` surface end-to-end, driven by a single **derived** onboarding-status endpoint (zero new state, no drift), plus a reference **Guide** page and an auto-generated **per-tenant Integration** page. Three small new operator endpoints (`onboarding-status`, `products`, `go-live`) and the two missing Stripe `connect/{return,refresh}` pages close every gap. **No schema changes.**

---

## 0. What already exists (verified against source)

| Capability | Endpoint / file | Notes for the train |
|---|---|---|
| Create tenant (+ default theme + default StoreSettings) | `POST /api/platform/tenants` | accepts `name, slug, platformFeeBps?, checkoutMode?`; slug uniqueness → 409; **does not** auto-suggest slug |
| Tenant detail (flags + counts) | `GET /api/platform/tenants/[id]` | returns `stripe{connected,accountId,onboarded}`, `theme`, `apiKeyCount`, `activeApiKeyCount`, `productCount` — **most of the derived map already lives here** |
| Theme get/set | `GET|PUT /api/platform/tenants/[id]/theme` | `validateThemeInput`: hex colors, font allowlist (Inter, Cormorant Garamond, Anonymous Pro, Happy Monkey, Oregano, Poppins, Playfair Display), radius ∈ {none,sm,md,lg}, logo/favicon URL/`r2://`/root-relative |
| Stripe Connect onboard | `POST /api/platform/tenants/[id]/connect` | body `{existingAccountId?, refreshUrl?, returnUrl?}`. **Accepts returnUrl/refreshUrl overrides** → the wizard can land the merchant back in the train. Default returnUrl/refreshUrl point at `/platform/tenants/[id]/connect/{return,refresh}` which **DO NOT EXIST** (the gap) |
| Stripe live status (+ syncs `stripeOnboarded`) | `GET /api/platform/tenants/[id]/stripe-status` | returns `{chargesEnabled,payoutsEnabled,detailsSubmitted,onboarded}`; **side-effect: writes `tenant.stripeOnboarded = charges_enabled`** — this is the poll target |
| Mint API key (shown once) | `POST /api/platform/tenants/[id]/api-keys` | `{name, scopes?, env?}`; scopes ∈ {store:read, store:write, checkout:create}; `env` ∈ {live,test}, **defaults live**; returns raw `token` + `prefix` + `warning` |
| Impersonate (audited) | `POST /api/platform/tenants/[id]/impersonate` → 303 `/admin` | mints tenant-scoped `as-admin-session` with `impersonatedBy`; preserves operator cookie; banner+Exit in admin shell; stop → `/api/platform/impersonate/stop` |
| Stripe helpers | `src/lib/stripe-connect.ts` | `createConnectAccount`, `createAccountOnboardingLink`, `attachExistingAccount` (validates + persists + seeds `stripeOnboarded` from `charges_enabled`) |
| Hosted store | `/t/[tenantSlug]/` | already themed; the go-live destination |
| API docs | `/api/v1/openapi.json`, `/api/v1/docs` (Swagger) | linked from the Integration page |
| Operator shell | `PlatformLayoutClient.tsx` nav: Dashboard · Tenants · Stripe · API Keys · Settings | add **Onboarding** |

**Gaps the train must close**
1. `POST .../connect` returns merchants to `/platform/tenants/[id]/connect/{return,refresh}` — **pages don't exist** (dead landing after KYC).
2. **No operator-callable product create.** `POST /api/admin/products` requires `as-admin-session` (store admin), not an operator cookie.
3. **No operator-callable go-live.** `storeEnabled` lives on `StoreSettings`, flipped only via `PUT /api/admin/settings` (store-admin, tenant-scoped). Operators have no admin session.
4. **No status aggregator.** The wizard needs one call that says which steps are done.
5. **Per-tenant go-live gating is ambiguous.** `proxy.ts:getStoreEnabled()` reads the **singleton** `StoreSettings WHERE id='singleton'` and gates only `/shop/*` (Artisans). The tenant hosted store at `/t/[slug]` is **not** gated by that. Go-live must (a) flip the *tenant's own* `StoreSettings.storeEnabled` and (b) we must verify `/t/[slug]` honors it (see §5/Open Q).

---

## 1. UX model of the process train

### Decision: **a dedicated, resumable wizard** at `/platform/onboarding/[tenantId]`, with a **compact derived checklist mirror** on the tenant detail page. Both read ONE source of truth: `GET /api/platform/tenants/[id]/onboarding-status`.

**Why a wizard (not a checklist-only on the detail page):** Wayne asked for a "process train to follow" — an ordered, opinionated path with momentum and microcopy ("what happens next"). A checklist communicates *state* but not *sequence* or *instruction*; a wizard does both. But we don't want two competing state stores, so the tenant detail page renders a **read-only mirror** of the same derived status with a single **"Resume onboarding →"** button. The wizard is primary; the checklist is a status glance + entry point.

### State persistence: **fully derived. No new column. No drift.**
"Which step is this tenant on" is *computed* from data that already exists, exactly once, by the aggregator endpoint:

| Step | Done condition (derived) | Source |
|---|---|---|
| 1 Create | tenant row exists | the `[id]` resolves |
| 2 Branding | `TenantTheme` differs from `DEFAULT_THEME` (else "using defaults", non-blocking) | `theme` vs `DEFAULT_THEME` in `src/lib/theme.ts` |
| 3 Stripe | `tenant.stripeOnboarded === true` | `Tenant` (kept fresh by `stripe-status` poll) |
| 4 Products | `productCount > 0` | `Product.count({tenantId})` |
| 5 API key | `activeApiKeyCount > 0` | `TenantApiKey.count({tenantId, revokedAt:null})` |
| 6 Integration | `activeApiKeyCount > 0` (page is generatable) | derived from step 5 |
| 7 Go live | `StoreSettings.storeEnabled === true` for this tenant | `StoreSettings({tenantId})` |

`currentStep` = first step whose done-condition is false (skipping non-blocking Branding). **Resume = open the wizard; it fetches status and lands on `currentStep`.** Closing the laptop and returning next week Just Works — there is nothing to persist because the truth is the data itself.

### Navigation & gates
- **Free navigation between steps** (click any step in the rail). Hard-locking every step is friction; the only gate that matters is **Go live**, which is *disabled* until its prerequisites are green. This is more frictionless than a linear lock and still impossible to misuse.
- **Go-live prerequisites (enforced server-side too):** `stripeOnboarded === true` **AND** `productCount > 0`. API key is **recommended, not required** (it's for embedding into the merchant's own site; the hosted `/t/[slug]` store sells without it).
- **Progress indicator:** a left/top step rail with per-step pills — `done` (green ✓) · `current` (accent) · `pending` (grey) · `blocked` (amber, e.g. Stripe in progress) · `optional` (Branding). A header progress bar shows `N/7`.

### Launcher
`/platform/onboarding` (index): a "**Start a new store**" card (the create form) + a list of **in-progress onboardings** (every tenant with `storeEnabled === false`) each showing its derived `N/7` and a "Resume" link. Live stores drop off the list.

---

## 2. Step-by-step spec

Each step: **data captured → endpoint → states → done.** Wizard component is a client component holding `tenantId` from the route; it re-fetches `onboarding-status` after every mutating action so the rail updates live.

### Step 1 — Create store
- **Capture:** `name` (required), `slug` (auto-suggested, editable), `platformFeeBps` (default 300 = 3%, advanced/collapsed).
- **Endpoint:** `POST /api/platform/tenants` → 201 `{id,slug,...}`. On the launcher this *creates* the tenant then routes to `/platform/onboarding/{id}`.
- **Auto-slug:** client slugifies `name` (`lowercase`, spaces→`-`, strip non-`[a-z0-9-]`, collapse `--`) matching `SLUG_RE`; debounced async availability check via `GET /api/platform/tenants?... ` (or a tiny `?slug=` HEAD — see §4). Show ✓ available / ✗ taken inline.
- **States:** validation_failed (inline field errors) · slug_taken 409 (suggest `slug-2`) · success.
- **Done:** tenant exists (the route now has an `[id]`). Default `TenantTheme` + `StoreSettings` are created by the POST transaction.

### Step 2 — Branding / theme  *(optional, non-blocking)*
- **Capture:** primary/secondary/accent (hex pickers), `fontHeading`/`fontBody` (dropdowns from the allowlist), `radius` (none/sm/md/lg), optional `logoUrl`/`faviconUrl`.
- **Endpoint:** `GET` then `PUT /api/platform/tenants/[id]/theme` (validated by `validateThemeInput`).
- **Live preview:** render a mock product card + header applying the chosen values as CSS variables (no new API).
- **States:** validation_failed (per-field) · saved.
- **Done / skip:** "done" when theme ≠ defaults; **"Skip — use sensible defaults"** is a first-class button (defaults already seeded). Never blocks later steps or go-live.

### Step 3 — Stripe Connect  *(the hard one — designed for the async, merchant-owned reality)*
KYC is the merchant's legal responsibility and is **asynchronous** (can take minutes to days). The train must never trap the operator waiting. Three offered paths, top to bottom by friction:

1. **Reuse an existing Stripe account** (one-click, instant for Orange Slice Sport). Field: `existingAccountId` (`acct_…`) → `POST .../connect {existingAccountId}` → `attachExistingAccount` validates + persists + seeds `stripeOnboarded` from `charges_enabled`. If already `charges_enabled`, **step is instantly green.** *This is the friction-killer for OSS tenants (see §6).*
2. **Onboard now (operator at the keyboard)** → `POST .../connect {}` (no body) creates/reuses the account, returns `url`; open Stripe in a new tab; wizard passes its own override:
   `returnUrl = {origin}/platform/onboarding/{id}?step=stripe&stripe=return`,
   `refreshUrl = {origin}/platform/onboarding/{id}?step=stripe&stripe=refresh`.
3. **Hand off to the merchant** → same `POST .../connect {}` but show the `url` with **Copy link** + "email to merchant" microcopy. The merchant completes KYC on their own time. The wizard marks Stripe **`blocked / in progress`** and the operator proceeds to Products/API key.

- **Return flow:** landing back in the wizard with `?stripe=return` triggers an immediate `GET .../stripe-status` (which syncs `stripeOnboarded`), then **polls every 5 s for up to ~60 s**. UI states:
  - `chargesEnabled` → **green "Onboarded ✓"**, advance.
  - `detailsSubmitted && !chargesEnabled` → **"Stripe is reviewing — usually a few minutes."** Stop polling; offer **"Check again"** + "you can continue and come back."
  - `!detailsSubmitted` → **"Onboarding not finished"** with **Resume** (re-mint link).
  - `no_connected_account` (409) → back to the three paths.
- **Default landing pages** (for the connect action invoked from the *tenant detail* page, which doesn't pass overrides): build `/platform/tenants/[id]/connect/{return,refresh}` (§4). `return` does the same poll then links to "Continue onboarding →"; `refresh` explains the link expired and re-mints via `POST .../connect`.
- **Done:** `stripeOnboarded === true`. **Go-live is gated on this; reaching later steps is not.**

### Step 4 — Products
- **Recommendation:** **inline minimal create as the primary path, impersonation deep-link as the "full editor" escape hatch.** (Justified in Open Q (a).)
- **Inline capture:** `name` (required), `price` in dollars → cents (required), optional `description`. → `POST /api/platform/tenants/[id]/products` (new, §4): creates the Product (status `ACTIVE`) **+ its default variant + zero-qty Inventory** (mirrors `POST /api/admin/products`, which auto-creates the default variant). One product satisfies the gate; the store is no longer empty.
- **Full editor:** **"Add products in the full admin →"** button → `startImpersonation(tenantId)` (existing audited flow) lands in `/admin/products`; the red impersonation banner + Exit returns the operator. On return, the wizard re-fetches status.
- **States:** validation_failed · created (increments count) · empty (gate not met).
- **Done:** `productCount > 0`.

### Step 5 — API key
- **Capture:** `name` (default "Storefront integration"), `scopes` (default `[store:read, checkout:create]`), `env` toggle (default **live** — see Open Q (c)).
- **Endpoint:** `POST /api/platform/tenants/[id]/api-keys` → 201 `{token, prefix, scopes, warning}`.
- **UI:** show the raw `token` **once**, large, with **Copy** and the red "store this now; it will not be shown again" warning; a "I've stored it safely" confirm before the token is cleared from the DOM.
- **States:** validation_failed · invalid_scopes · minted-once.
- **Done:** `activeApiKeyCount > 0`.

### Step 6 — Integration instructions (per-tenant, generated)
- **No capture.** A server-rendered page personalizing `INTEGRATION_PLAYBOOK.md` for this tenant: base URL (`req` origin / `NEXT_PUBLIC_BASE_URL`), `slug`, **key prefix** (never the secret — that was shown once in step 5), hosted store `/t/{slug}`, the API table with the tenant's real slug substituted, `curl` examples, and links to `/api/v1/docs` (Swagger) + `/api/v1/openapi.json`.
- **Reachable from:** the wizard step (embedded/iframe-free, same page) **and** a permanent **"Integration page →"** link on the tenant detail page (so it's findable forever, not just during onboarding).
- **Done:** generatable once `activeApiKeyCount > 0` (so the prefix exists). Viewing marks it ✓ (derived; no state needed).

### Step 7 — Go live
- **Final checklist** rendering the derived map green/amber: Stripe ✓ · ≥1 product ✓ · (API key ✓ — recommended) · branding (✓ or "defaults").
- **Action:** **"Take store live"** → `POST /api/platform/tenants/[id]/go-live` (new, §4). Server **re-checks prerequisites** (`stripeOnboarded && productCount>0`) and flips the tenant's `StoreSettings.storeEnabled = true`; 409 with the unmet list otherwise.
- **States:** blocked (button disabled, shows what's missing) · live (🎉 + link to `/t/{slug}` + Integration page) · already-live.
- **Done:** `storeEnabled === true` → tenant disappears from the in-progress launcher list.

---

## 3. The instructions / reference page

### A. `/platform/onboarding/guide` — the operator handbook (static, server component)
A single scannable page documenting the whole train so an operator (or a new teammate) understands it without running it. Sections:
- **Overview** — the 7-step train and what each accomplishes; "frictionless path: nothing → live, sellable store."
- **Before you start** — what to have ready: store name, the merchant's Stripe situation (new vs existing `acct_…`), brand colors/logo, at least one product, where the storefront will be embedded.
- **Stripe deep-dive** — Standard Connect = merchant is merchant-of-record; KYC is the merchant's job and is async; the three paths (reuse / onboard-now / hand-off link); what "details submitted but not charges_enabled" means; platform fee (`platformFeeBps`, bps).
- **API keys** — scopes table; live vs test; the once-only display; rotation/revocation; never ship `checkout:create` to the browser.
- **Going live** — prerequisites; what `storeEnabled` does; the hosted `/t/[slug]` store vs API embedding.
- **Troubleshooting** — slug taken; Stripe stuck pending; 409 `tenant_stripe_not_onboarded` on checkout; rate limits.
- Linked from the **Onboarding** nav (a "Guide" sub-link / header button) and from each wizard step's "Learn more".

### B. `/platform/tenants/[id]/integration` — the generated per-tenant page (the playbook, personalized)
The shippable artifact the merchant receives. Same content as `INTEGRATION_PLAYBOOK.md` with every placeholder resolved for this tenant (base URL, slug, key **prefix**, hosted URL, examples), plus the Swagger/OpenAPI links. **Reachable from:** wizard step 6 and a permanent link on the tenant detail page. (Implementation: server component reading `Tenant` + latest `TenantApiKey.prefix` via raw prisma behind `requirePlatformOperator`; no new API route required.)

---

## 4. New routes / files (exact)

**New operator pages** (`src/app/platform/(protected)/`)
- `onboarding/page.tsx` — launcher (start new + resume list). *client*
- `onboarding/[tenantId]/page.tsx` — the process train. *client* (reads `onboarding-status`, renders rail + active step, handles `?step=&stripe=` query for the Stripe return/refresh).
- `onboarding/guide/page.tsx` — operator handbook. *server*
- `tenants/[id]/connect/return/page.tsx` — Stripe return landing (poll `stripe-status`, then "Continue onboarding →"). *client* — **closes gap #1.**
- `tenants/[id]/connect/refresh/page.tsx` — Stripe link-expired landing (re-mint via `POST .../connect`). *client* — **closes gap #1.**
- `tenants/[id]/integration/page.tsx` — generated per-tenant integration page. *server*

**New API endpoints** (`src/app/api/platform/tenants/[id]/`) — all gated by `requirePlatformOperator` + `platformAuthErrorResponse` (copy the exact try/catch prologue used by every sibling route)
- `onboarding-status/route.ts` — `GET` → the derived map:
  ```jsonc
  { "tenantId","slug","storeEnabled",
    "steps":{
      "create":{done:true},
      "branding":{done:bool, optional:true, usingDefaults:bool},
      "stripe":{done:bool, state:"none|in_progress|onboarded", accountId},
      "products":{done:bool, count:int},
      "apiKey":{done:bool, activeCount:int},
      "integration":{done:bool},        // mirrors apiKey.done
      "goLive":{done:bool, blockedBy:["stripe","products"]} },
    "currentStep":"stripe", "completedCount":3, "total":7 }
  ```
  Single source of truth for the wizard, the tenant-detail mirror, and the gate script. Reads `Tenant`, `TenantTheme` (vs `DEFAULT_THEME`), `Product.count`, `TenantApiKey.count(revokedAt:null)`, `StoreSettings`.
- `products/route.ts` — `POST {name, price, description?}` → create Product (`status:ACTIVE`) + default variant + zero Inventory via raw prisma keyed by `tenantId` (port the default-variant block from `POST /api/admin/products`). Minimal by design; full editing via impersonation. (Optional `GET` to list for the step UI — or reuse the count from `onboarding-status`.)
- `go-live/route.ts` — `POST` → re-validate `stripeOnboarded && productCount>0`; on pass `StoreSettings.update({where:{tenantId}, data:{storeEnabled:true}})`; on fail 409 `{error:"prerequisites_unmet", missing:[...]}`. Add `DELETE` (un-publish → `storeEnabled:false`) for symmetry. — **closes gaps #2,#3.**
- *(Optional)* extend `GET /api/platform/tenants` (or add `?slug=` check) for live slug-availability in step 1; otherwise the create POST's 409 is the fallback.

**Modified files**
- `PlatformLayoutClient.tsx` — add `{href:"/platform/onboarding", label:"Onboarding", icon:…}` to `NAV_ITEMS` (between Tenants and Stripe); a "Guide" link in the Onboarding section.
- `tenants/[id]/page.tsx` — add an **Onboarding checklist** card (mirror of `onboarding-status`) with **"Resume onboarding →"**, a permanent **"Integration page →"** link, and **Stripe Connect action buttons** (the detail page currently shows Stripe *flags* but offers no way to *start* connect — add the three-path control or at least a "Set up Stripe →" deep-link into the wizard's Stripe step).
- `connect/route.ts` — **no change required** (already honors `returnUrl`/`refreshUrl` overrides; the new default pages now exist for the no-override callers).

**No change:** `proxy.ts` (all new paths live under already-gated `/platform/*` + `/api/platform/*`), `stripe-connect.ts`, schema.

---

## 5. Data / schema

**Recommendation: NO schema changes.** Every step's completion is derivable from existing tables (§1). Adding an `onboardingStep`/`onboardingState` column would immediately drift from reality (e.g. a key revoked, Stripe later disabled) — derived state can't drift.

**Considered and rejected (additive `onboardingCompletedAt` on `Tenant`):** its only value is distinguishing "intentionally completed" from "happens to be live," and suppressing the 🎉 on revisit. Both are cosmetic and already answered by `storeEnabled`. Skip it; revisit only if product wants a completion timestamp for analytics — and even then prefer deriving from `PlatformAuditLog` (add a `go-live` audit row in the go-live endpoint, consistent with impersonation logging) over a column.

**One gating fact to verify (not a schema change):** `proxy.ts:getStoreEnabled()` is **Artisans-singleton-only** and gates `/shop/*`, not `/t/[slug]`. The go-live endpoint correctly flips the *tenant's own* `StoreSettings.storeEnabled`; phase O1 must confirm `/t/[tenantSlug]/layout.tsx` (or page) reads that per-tenant flag and 404s/redirects when false. If it doesn't today, that's a small additive guard in the storefront layout — called out as Open Q (d).

---

## 6. Frictionless touches

- **Auto-suggest slug** from the name with live availability (step 1).
- **Sensible defaults everywhere:** `platformFeeBps=300`, theme defaults pre-seeded (Branding skippable), key scopes pre-checked, key name pre-filled, product price input in dollars (auto ×100).
- **Reuse the existing Orange Slice Sport Stripe account** via `attachExistingAccount` — one paste of `acct_…` and Stripe is instantly green for OSS tenants.
- **Copy-to-clipboard** on: API key token, Stripe hand-off link, integration `curl` snippets, hosted store URL.
- **Inline validation** on slug/colors/price; never a full-page error.
- **"What happens next" microcopy** under every step (e.g. Stripe: "The merchant finishes ID/bank verification on Stripe's site — this can take a few minutes. You can keep going and come back; the train remembers where you are.").
- **Resumability is invisible** — derived state means there's nothing to "save"; closing and reopening lands on the right step.
- **Final green checklist** + 🎉 with direct links to the live `/t/[slug]` store and the Integration page.

### The single biggest friction point — and how it's eliminated
**Stripe Connect KYC: async + merchant-owned.** It's the only step the operator can't simply *complete* at will, and a naive wizard would block the whole train waiting on it. Eliminated three ways: **(1)** one-click **reuse-existing-account** (instant green for OSS — the common case for Wayne/Mike); **(2)** a **non-blocking "in progress" state** so Products/API key/Integration all proceed while KYC settles, with go-live the only thing gated; **(3)** a **shareable hand-off link** + auto-poll-on-return so the merchant does their part asynchronously and the train auto-detects completion. The dead `/connect/{return,refresh}` landings (gap #1) are built so the merchant never hits a 404 after finishing.

---

## 7. Phased execution plan

Each phase is independently shippable, `tsc`-clean, and `npm run build`-green. Reuse the env-loading + JWT-minting harness from `scripts/test-operator-authz.ts` / `scripts/test-onboarding.ts` for gates.

### O1 — Aggregator + go-live + inline product (the backbone, headless)
- **Scope:** `onboarding-status`, `products`, `go-live` routes (§4). Verify/guard per-tenant `storeEnabled` on `/t/[slug]` (Open Q (d)).
- **Files:** 3 new `api/platform/tenants/[id]/{onboarding-status,products,go-live}/route.ts`; possibly `src/app/t/[tenantSlug]/layout.tsx` (guard).
- **GATE (NEW — the automated train test):** `scripts/test-onboarding-train.ts` — mints an operator session, then drives a **fresh** tenant fully to live and asserts the aggregator flips each step:
  1. `POST /tenants` → `onboarding-status` shows `create.done`, `currentStep:"stripe"`, `goLive.blockedBy` includes stripe+products.
  2. simulate KYC: directly set `tenant.stripeOnboarded=true` via prisma (real KYC is un-automatable in CI) → status shows `stripe.done`.
  3. `POST .../products {name,price}` → `products.done`, `productCount==1`.
  4. `POST .../api-keys` → `apiKey.done`, `integration.done`.
  5. `POST .../go-live` → 200; `StoreSettings.storeEnabled==true`; status `goLive.done`, `completedCount==7`.
  6. negative: a second fresh tenant → `POST .../go-live` **before** stripe/products → **409 `prerequisites_unmet`** with both missing.
  Prints `ONBOARDING_TRAIN_PASS`, exit 0. *(Cleans up its test tenants.)*
- **Also:** `tsc` · `npm run build` · existing suite (`test-isolation`, `test-admin-scoping`, `test-operator-authz`) still green.

### O2 — Stripe return/refresh pages (close gap #1)
- **Scope:** `connect/{return,refresh}/page.tsx` (poll `stripe-status`, sane states, onward links).
- **GATE:** `tsc` · `build` (routes registered) · **manual:** start connect from tenant detail → complete Stripe test KYC → land on `/connect/return` → poll flips to "Onboarded ✓"; expire/cancel → `/connect/refresh` re-mints.

### O3 — The wizard (`/platform/onboarding/[tenantId]`) + launcher
- **Scope:** the train UI (rail, per-step panels 1–7, live re-fetch of `onboarding-status`, `?step=&stripe=` handling that reuses the O2 poll logic, live theme preview, once-only key reveal, inline product create + impersonation deep-link, go-live checklist); `onboarding/page.tsx` launcher; **Onboarding** nav item.
- **GATE:** `tsc` · `build` · **manual click-through:** Wayne onboards a brand-new tenant nothing→live without leaving the train (reuse-OSS-Stripe path); refresh mid-way → resumes on `currentStep`.

### O4 — Reference + integration pages
- **Scope:** `onboarding/guide/page.tsx`; `tenants/[id]/integration/page.tsx`; tenant-detail checklist mirror + Integration/Resume links + Stripe action control.
- **GATE:** `tsc` · `build` · **manual:** integration page shows correct slug/prefix/hosted URL + working `curl`s + Swagger link; guide renders; detail page resume/integration links work.

### O5 — Polish & docs
- **Scope:** copy-to-clipboard everywhere, microcopy pass, empty/error states, optional `go-live` audit-log row; update `PLATFORM_SEPARATION_PLAN.md` execution record / handoff notes.
- **GATE:** full script suite green (`test-isolation` · `test-admin-scoping` · `test-operator-session` · `test-operator-authz` · `test-impersonation` · `test-onboarding` · **`test-onboarding-train`**) · `build`.

---

## 8. Open questions (each with a recommended default — execution is not blocked)

**(a) Products: inline vs impersonation deep-link?** → **Both, inline primary.** A minimal operator `POST .../products {name,price}` satisfies the "not empty" gate without leaving the train (lowest friction), while **"Add products in the full admin →"** uses the existing audited impersonation for rich editing (images, variants, story). Rationale: duplicating the full product editor under `/platform` is large and would drift from the admin one; the gate only needs *one* product, and impersonation already exists and is safe (P8 isolation + audit).

**(b) Does "operator completes Stripe" make sense, or is KYC always the merchant's job?** → **KYC is fundamentally the merchant's** (legal identity/bank/tax = merchant-of-record). The wizard supports both realities: when operator == merchant (Orange Slice Sport: Wayne/Mike), **reuse-existing-account** or **onboard-now** finishes it in seconds; otherwise the **shareable hand-off link** + non-blocking "in progress" + auto-poll lets the merchant do it asynchronously while onboarding continues. So "operator completes Stripe" is *offered* (and is the fast path for OSS) but never *required* to keep moving.

**(c) Live vs test API key default during onboarding?** → **Default `live`** (the route already defaults live; the whole point is a live, sellable store), with a **prominent "test key instead" toggle** and microcopy. Rationale: onboarding's success condition is a *production* store; defaulting to test would mint a key the merchant can't transact with and force a re-mint at go-live. The toggle covers sandbox integration work.

**(d) Does `/t/[slug]` honor per-tenant `storeEnabled`?** → **Verify in O1; add a guard if missing.** The proxy's `getStoreEnabled` is Artisans-singleton-only (gates `/shop`, not `/t/[slug]`). Recommended default: the go-live endpoint flips the tenant's own `StoreSettings.storeEnabled`, and `/t/[tenantSlug]/layout.tsx` reads that flag (additive guard, redirect/404 when false) so "go live" actually controls public visibility. Until confirmed, treat go-live as setting the flag the storefront *should* read.

**(e) Should the launcher show every non-live tenant, or only ones with onboarding activity?** → **Every `storeEnabled===false` tenant** (simplest, derived, no flag). Live stores drop off automatically. Revisit only if the list grows noisy.

---

## EXECUTION RECORD (shipped)

All five phases executed via gated loop. Author: Wayne Kool. The train takes a store from nothing → live & sellable, driven entirely by **derived** state (`GET .../onboarding-status`) — no new schema column, no drift. Operator-only throughout (`requirePlatformOperator`, `as-platform-session`).

| Phase | Commit | What shipped | Gates |
|---|---|---|---|
| **O1** | `9c7c9d8` | Backbone (headless): `onboarding-status` derived aggregator, operator-callable `products` (Product + default variant + zero Inventory), `go-live` (server re-validates `stripeOnboarded && productCount>0`; 409 `prerequisites_unmet` with `missing[]`; POST publishes / DELETE un-publishes; each writes a `PlatformAuditLog` row — `go-live` / `go-live.revert`). `/t/[slug]` per-tenant `storeEnabled` guard confirmed. | tsc · build · **`onboarding-train`** · isolation · admin-scoping · operator-authz |
| **O2** | `3eccb6a` | Stripe Connect return/refresh landing pages (`tenants/[id]/connect/{return,refresh}`) — close the post-KYC 404 gap; `return` polls `stripe-status` (5s × ~60s) then "Continue onboarding →"; `refresh` re-mints the expired single-use link. | tsc · build |
| **O3** | `22ef399` | The process train: resumable 7-step wizard (`onboarding/[tenantId]`) with step rail, live re-fetch after every mutation, `?step=&stripe=` deep-links, live theme preview, three-path Stripe (reuse / onboard-now / hand-off link) with auto-poll, once-only key reveal, inline product create + impersonation escape-hatch, go-live checklist; launcher (`onboarding/`, start-new + derived in-progress list); **Onboarding** nav item. | tsc · build |
| **O4** | `1abbe48` | Reference + integration surfaces: operator handbook (`onboarding/guide`); generated per-tenant integration page (`tenants/[id]/integration`, resolved base URL / slug / key prefix / hosted URL / `curl`s + Swagger links); tenant-detail onboarding-checklist mirror + Resume / Integration links + Stripe action control. | tsc · build |
| **O5** | (this) | Polish & docs: copy-to-clipboard audited across the train — minted key token (step 5), Stripe hand-off link (step 3), hosted store URL (step 6), integration-page `curl` snippets (`_CodeBlock` island) — each with a transient "Copied ✓"; per-step "what happens next" microcopy; empty states (launcher in-progress, products count 0, api-key pre-mint) and inline human-readable error states (`validation_failed` field errors, `slug_taken` 409 with `slug-2` suggestion, go-live `prerequisites_unmet` missing list, `StripeConnectError`) — never raw JSON or a blank screen; go-live audit-log confirmed (O1). Execution record + handoff pointer. | **full suite** |

### Frictionless touches (as shipped)
- **Auto-suggest slug** from name (launcher), `slug_taken` 409 → one-click "use `{slug}-2`".
- **Sensible defaults:** `platformFeeBps=300`, theme pre-seeded (branding skippable, never blocks go-live), key scopes pre-checked, key name pre-filled, product price in dollars (×100 server-side), **live** key default.
- **Reuse existing Stripe account** (`acct_…` paste → `attachExistingAccount`) → instantly green when `charges_enabled` — the OSS fast path.
- **Stripe async, non-blocking:** hand-off link + "in progress" state lets Products/API-key/Integration proceed while KYC settles; only go-live is gated. Auto-poll-on-return detects completion; the `connect/{return,refresh}` pages mean the merchant never hits a 404.
- **Copy-to-clipboard** on key token, hand-off link, hosted URL, `curl` snippets.
- **Resumability is invisible** — derived state means nothing to "save"; reopening lands on `currentStep`.
- **Final 🎉** with direct links to the live `/t/[slug]` store and the integration page.

### New surfaces (as shipped)
- **Pages:** `onboarding/` · `onboarding/[tenantId]/` · `onboarding/guide/` · `tenants/[id]/connect/{return,refresh}/` · `tenants/[id]/integration/`.
- **Endpoints (operator-gated):** `tenants/[id]/onboarding-status` (GET) · `tenants/[id]/products` (POST) · `tenants/[id]/go-live` (POST/DELETE).
- **No schema change.** Completion is derived; the only audit trail is `PlatformAuditLog` (`go-live` / `go-live.revert`).

### Full gate suite (all green)
`test-isolation` · `test-admin-scoping` · `test-operator-session` · `test-operator-authz` · `test-impersonation` · `test-onboarding` · `test-onboarding-train`
