# Operator Console — Weakness Audit & Build-Ready Plan

_Audit date: 2026-06-27 · Branch `main` · Next.js 16 / Prisma / single Neon DB / R2 / Vercel_
_Scope: `src/app/platform/(protected)/*` + `src/app/api/platform/*`. Grounded in the real files; refs are `path:line`._

---

## 1. Executive summary — the disease behind the symptoms

The operator console was built as a **one-way creation funnel**. Every feature that exists pushes a tenant _into_ existence and _forward_ through onboarding: create tenant → brand → Stripe → products → mint key → integration → go‑live. That pipe is genuinely good (the onboarding wizard is derived-state, resumable, multi-path — `onboarding/[tenantId]/page.tsx`). But the console has **no other half**:

- **No off‑ramp.** You can create a tenant; you cannot retire one. `api/platform/tenants/[id]/route.ts` is **GET + PATCH only — there is no DELETE** (verified, lines 20/84 are the only exports). There is no `ARCHIVED` lifecycle state; `TenantStatus` is `ACTIVE | SUSPENDED | PENDING` (`schema.prisma:66`).
- **No outbound link to the artifact being built.** The console builds storefronts at `/t/{slug}` but never _links_ to one. The Tenants list row actions are only "Mint API key" + "Impersonate" (`tenants/page.tsx:216-217`); the detail page links to onboarding/integration/Stripe but **never to the live store** (`tenants/[id]/page.tsx`). The operator can configure a store they can't open.
- **No operations/read-back view.** Once a store is live there is nowhere to see orders, revenue, or customers, and no first-class suspend/reactivate/archive control — `status` is editable only as a raw enum field buried in PATCH, with no UI button.

Wayne's two complaints ("no DELETE", "no VIEW link") are not two bugs — they are the two most visible holes in the **missing back half of the lifecycle**: _operate_ and _retire_. This plan fixes both named items first, then closes the rest of that half.

**One latent data-loss landmine to call out up front:** a naive `prisma.tenant.delete()` will **not** FK‑fail. Only `TenantApiKey` and `TenantTheme` hold a real FK to `Tenant`, both `onDelete: Cascade` (`schema.prisma:38,53`). **Every other tenant-scoped table (~33 models) carries a bare `tenantId` string column with _no_ foreign key** (see `TENANT_SCOPED_MODELS`, `tenant-prisma.ts:38-73`). So a hard delete **succeeds silently and orphans everything** — Products, Orders, **Customers (PII)**, StoreSettings, etc. — invisibly keyed to a dead tenant id. That is worse than a crash. The deletion design (§3) exists primarily to defuse this.

---

## 2. Prioritized punch‑list

### P0 — Wayne named these / data-loss or correctness risk

| # | Item | Where | Why |
|---|------|-------|-----|
| P0‑1 | **No tenant delete/archive** | `api/platform/tenants/[id]/route.ts` (no DELETE); `tenants/page.tsx:215-218`; `schema.prisma:66` | Wayne's #1. No way to remove a throwaway `test-store`. See §3 for the careful design. |
| P0‑2 | **Silent-orphan on any future hard delete** | `tenant-prisma.ts:38-73`; `schema.prisma:36-64` | Only 2 of ~35 tenant tables cascade. A naive delete leaves orphaned Orders/Customers (PII). Must be designed, not patched. |
| P0‑3 | **No "View store" link** | `tenants/page.tsx` rows; `tenants/[id]/page.tsx` header | Wayne's #2. Console → `/t/{slug}` dead-end. Must handle `storeEnabled=false` (404s) → show "Preview/Not live yet". |
| P0‑4 | **Impersonate ignores tenant status** | `api/platform/tenants/[id]/impersonate/route.ts:38-41` | Loads tenant but never checks `status`. Can impersonate a SUSPENDED (storefront 404'd) tenant; post-archive would mint a synthetic admin session into a hollow store. |
| P0‑5 | **House/"Artisans" singleton is treated as a deletable/suspendable tenant** | `isPlatformOwner` (`schema.prisma:24`); storefront also at `/shop` | Nothing stops archiving/deleting/suspending the platform-owner tenant, which would 404 `/shop` and the flagship store. Needs a hard guard everywhere status changes. |

### P1 — clear functional gaps

| # | Item | Where | Why |
|---|------|-------|-----|
| P1‑1 | No suspend/reactivate **button** | `tenants/[id]/page.tsx`; PATCH exists but no UI | `status` is settable via PATCH but there's no operator control. Status is shown as raw text, not actionable (`tenants/page.tsx:212`). |
| P1‑2 | No search / filter / sort on Tenants | `tenants/page.tsx:206-220` | Linear table, no search box, no created-date column, no status filter. Breaks past ~20 tenants. |
| P1‑3 | No per-tenant quick stats (orders / revenue / customers) | `tenants/[id]/page.tsx` Overview card (products/fee/checkout/keys only, `:242-247`) | Operator can't tell a live, earning store from a dead one. Also the data needed to _gate_ a safe delete. |
| P1‑4 | Dashboard is thin & capped | `platform/(protected)/page.tsx` | 3 count cards + "recent 5" only; no revenue, no "needs attention", no pagination, no link depth. |
| P1‑5 | API Keys page is a placeholder | `api-keys/page.tsx` | Pure redirect-to-tenants stub; no cross-tenant key inventory, no revoke from here. |
| P1‑6 | Stripe page is a flat read-only roll-up | `stripe/page.tsx` | No counts ("5/20 onboarded"), no sort/filter, no link to Stripe dashboard for the connected acct. |
| P1‑7 | No "View store" / status reflected on Stripe & Onboarding lists either | `stripe/page.tsx`, `onboarding/page.tsx` | Same dead-end as P0‑3 across every list surface. |
| P1‑8 | R2 has no delete/list capability | `lib/r2.ts` (only `putObject`/`publicUrl`/`isR2Configured`) | Tenant delete can't clean `tenants/{id}/…`; objects orphan in the bucket. Needed by §3. |

### P2 — polish / hardening

| # | Item | Where |
|---|------|-------|
| P2‑1 | Destructive actions have no confirm (impersonate, sign-out, go-live) | `tenants/page.tsx:217`, `PlatformLayoutClient` sign-out, wizard go-live |
| P2‑2 | No empty/error states on some surfaces; inconsistent loading copy | across pages |
| P2‑3 | Inline-style design system (no shared tokens/components); a11y gaps (status by ✓/✗ glyph only, color-only flags, no aria on modals/drawer; no ESC to close) | `tenants/page.tsx` mint modal, `PlatformLayoutClient` drawer |
| P2‑4 | Settings page is read-only identity only; no operator mgmt, no audit-log viewer | `settings/page.tsx` |
| P2‑5 | **No audit-log viewer anywhere** — `PlatformAuditLog` is written but never surfaced | `schema.prisma:112`; writes in impersonate/go-live routes |
| P2‑6 | Mobile: 5–6 col tables don't wrap; tenant detail dense | list pages |
| P2‑7 | Integration artifact has no version/date; links open new-tab and break back-button | `tenants/[id]/integration/page.tsx` |

---

## 3. Tenant-deletion design (the careful part)

### Recommended model: **two-tier — Archive (default, reversible) + Hard delete (gated, irreversible)**

A live store with real orders/customers must **not** be trivially destroyable; a throwaway `test-store` must be **one confirm** to remove. Those are different needs → two actions, not one.

#### Tier 1 — Archive (soft, reversible, the default button)
- **Add `ARCHIVED` to `TenantStatus`** (`schema.prisma:66`; `TENANT_STATUSES` in `platform-tenants.ts:17`). `ARCHIVED` ≠ `SUSPENDED`: SUSPENDED is a punitive/billing hold; ARCHIVED is "operator retired this, hide it." Keeping them distinct preserves meaning and lets reactivate restore the _prior_ state.
- **Effect:** storefront 404s (extend the existing gate in `storefront.ts:38` — currently `status === "SUSPENDED"` → null; make it `SUSPENDED || ARCHIVED`), tenant drops out of default console lists (add `where: { status: { not: "ARCHIVED" } }` unless `?includeArchived=1`), **all API keys revoked** (`revokedAt = now()` on `TenantApiKey`), impersonation blocked (P0‑4 guard).
- **Reversible:** an "Unarchive" / "Reactivate" action flips back to `ACTIVE` (keys are _not_ auto-restored — re-mint). No data touched.
- This is what Wayne reaches for 95% of the time and it's safe.

#### Tier 2 — Hard delete (irreversible, behind a wall)
- **Allowed only when:** tenant is **not** `isPlatformOwner` (house store, P0‑5), **and** has **zero paid orders** (`Order.financialStatus` indicating paid — block if any exist; a store that took real money is archive-only), **and** the operator types the exact **slug** to confirm.
- **Does a complete transactional sweep**, because nothing cascades on its own (P0‑2). Delete in FK-safe leaf→root order inside one `prisma.$transaction` (or via `getTenantPrisma(tenantId).<model>.deleteMany({})` looping the `TENANT_SCOPED_MODELS` manifest, `tenant-prisma.ts:38`). Intra-tenant cascades help (Order→OrderItem, Product→variants/images are `Cascade`) but cross refs without `onDelete` (e.g. `OrderItem.product`, `Review.customer`) mean **order matters** — delete order-items/returns/reviews/inventory before products/customers, products/customers before the tenant row. Finally `prisma.tenant.delete()` (cascades `TenantApiKey` + `TenantTheme`).
- **External resources — decide explicitly, do NOT blindly destroy:**
  - **Stripe Connect account:** the **merchant's**, not ours. **Detach only** — null `stripeConnectAccountId`/`stripeOnboarded` on our side; never call account-delete. (Archive leaves it intact too.)
  - **R2 objects** `tenants/{id}/…`: add `deleteObjectsByPrefix` to `lib/r2.ts` (P1‑8) and sweep on hard delete; on archive, **leave** (cheap, reversible) or hand to a bucket lifecycle rule.
- **Audit** every archive/delete/reactivate via the existing pattern: `prisma.platformAuditLog.create({ data: { operatorId, operatorEmail, action, tenantId, detail } })` (mirror `go-live/route.ts:63`). Actions: `tenant.archive`, `tenant.reactivate`, `tenant.delete`. For delete, write the audit row with a snapshot detail **before** the sweep (so the trail survives — `PlatformAuditLog.tenantId` is just a nullable string, not an FK, so it persists).

### Endpoint contract

```
PATCH /api/platform/tenants/[id]        # already exists — extend status enum to allow ARCHIVED
  body { status: "ARCHIVED" | "ACTIVE" | "SUSPENDED" | "PENDING" }
  guard: 403 if isPlatformOwner && status ∈ {ARCHIVED, SUSPENDED}
  side-effect on → ARCHIVED: revoke active TenantApiKeys; audit "tenant.archive"
  side-effect on → ACTIVE (from ARCHIVED): audit "tenant.reactivate"

DELETE /api/platform/tenants/[id]        # NEW
  body { confirmSlug: string }           # must equal tenant.slug
  preconditions (else 4xx, machine-readable error code):
    - 404 tenant_not_found
    - 403 platform_owner_undeletable      (isPlatformOwner)
    - 409 slug_mismatch                   (confirmSlug !== slug)
    - 409 has_paid_orders { count }       (any paid Order)  ← archive instead
  effect (one transaction):
    - deleteMany across TENANT_SCOPED_MODELS in FK-safe order
    - prisma.tenant.delete (cascades apiKeys + theme)
    - r2.deleteObjectsByPrefix(`tenants/${id}/`)   (best-effort, logged)
    - Stripe: detach only (no remote delete)
    - audit "tenant.delete" written BEFORE sweep with snapshot detail
  200 { deleted: true, slug }
```

### Test
- Unit/integration (mirror `U2`'s isolation test style): seed two tenants A + B; archive A → assert `/t/{A.slug}` returns 404, A's keys all `revokedAt != null`, B untouched, audit row `tenant.archive` exists. Reactivate A → 404 clears.
- Hard delete of a fresh `test-store` (no orders) → assert **zero** rows remain across every model in `TENANT_SCOPED_MODELS` for that `tenantId` (the orphan check — this is the regression test that proves P0‑2 is closed), tenant row gone, B intact, R2 prefix delete called, Stripe account-delete **not** called, audit `tenant.delete` present.
- Guard tests: delete with wrong `confirmSlug` → 409; delete tenant with a paid order → 409 `has_paid_orders`; delete/archive `isPlatformOwner` tenant → 403.

---

## 4. Phased build plan (each phase scoped, gated, shippable)

> Lead with exactly the two things Wayne named, shippable on day one, then close the lifecycle in priority order. Each phase ends with a **gate** that must pass before the next.

### Phase A1 — "View store" link _(P0‑3, ~½ day, ship first)_
- Add a **View store** action to each Tenants-list row (`tenants/page.tsx`) and the tenant-detail header (`tenants/[id]/page.tsx`), `→ /t/{slug}` in a new tab.
- Reflect liveness: if `storeEnabled` is false, render **"Preview (not live yet)"** styling and still open `/t/{slug}` (which 404s today) — so first add `storeEnabled` to the list payload (`api/platform/tenants/route.ts` GET) and detail payload, then a "Preview" route or simply label it. Minimal: label + link; surface `storeEnabled` so the operator isn't surprised by a 404.
- Also drop the same link on Stripe + Onboarding lists (P1‑7).
- **Gate:** from Tenants list and detail, operator can open every store's `/t/{slug}` in one click; non-live stores are visibly labeled.

### Phase A2 — Archive (soft delete) + suspend/reactivate buttons _(P0‑1 tier 1, P1‑1, P0‑5, ~1–1.5 days)_
- Migration: add `ARCHIVED` to `TenantStatus`; update `TENANT_STATUSES` (`platform-tenants.ts:17`).
- Extend `storefront.ts:38` gate to 404 on `ARCHIVED` too.
- Extend PATCH side-effects: on archive, revoke keys + audit; add `isPlatformOwner` guard (P0‑5).
- UI: **Archive**, **Suspend/Reactivate** buttons on tenant detail with a confirm dialog; status badge becomes actionable on the list. Default list hides `ARCHIVED` (toggle to show).
- **Gate:** archive a `test-store` → it leaves the default list, `/t/{slug}` 404s, keys revoked, audit row written, reactivate restores; house store cannot be archived/suspended (button hidden + 403).

### Phase A3 — Hard delete (gated) + R2/Stripe handling _(P0‑1 tier 2, P0‑2, P1‑8, ~2 days)_
- Add `deleteObjectsByPrefix` (+ `listObjectsByPrefix`) to `lib/r2.ts`.
- New `DELETE /api/platform/tenants/[id]` per §3 contract: preconditions, transactional sweep over `TENANT_SCOPED_MODELS`, Stripe detach-only, R2 prefix delete, pre-sweep audit.
- UI: **Delete permanently** appears only on `ARCHIVED`, non-house, no-paid-orders tenants; typed-slug confirmation modal; clear "this cannot be undone" copy. For everything else the UI offers Archive.
- **Gate:** the §3 test suite green, especially the **orphan-check** (zero rows across all scoped models after delete). Verify a `test-store` is fully removable end-to-end; a store with a paid order is delete-blocked and archive-only.

### Phase A4 — Impersonation safety _(P0‑4, ~½ day)_
- In `impersonate/route.ts`, after load (`:38`) reject `SUSPENDED`/`ARCHIVED` (403 `tenant_unavailable`); consider a banner if the operator is mid-impersonation when a tenant is suspended.
- **Gate:** cannot start impersonation into a non-ACTIVE tenant; existing happy path unchanged.

### Phase A5 — Tenant list usability _(P1‑2, ~1 day)_
- Search box (name/slug), status filter, created-date column + sort, archived toggle. Server-side params on `api/platform/tenants` GET.
- **Gate:** find any tenant by name/slug in one box; archived hidden by default.

### Phase A6 — Per-tenant + dashboard ops stats _(P1‑3, P1‑4, ~1.5 days)_
- Tenant-detail Overview: add orders count, paid revenue, customers (drives the delete gate too). Dashboard: add revenue/at-attention cards + "needs go-live" list; paginate.
- **Gate:** operator can distinguish an earning store from a dead one at a glance.

### Phase A7 — Audit-log viewer + console polish _(P2‑1…P2‑7, ~1–2 days)_
- Surface `PlatformAuditLog` (read-only table on Settings or a new "Activity" page) — it's written but invisible today.
- Confirm dialogs on impersonate/sign-out/go-live; a11y pass (aria, ESC-to-close, non-color status); fill Stripe/API-keys pages with real counts + revoke; mobile table wrapping.
- **Gate:** every destructive action confirms; audit trail is viewable; lighthouse/a11y smoke passes.

---

## 5. Open questions (with sane defaults — proceed on these unless told otherwise)

1. **`ARCHIVED` vs reuse `SUSPENDED` for archive?** → **Default: add `ARCHIVED`.** Distinct meaning (retired vs punitive), and reactivation can restore prior state. (One small migration.)
2. **Hard-delete gate = "no paid orders" or "no orders at all"?** → **Default: no _paid_ orders.** A store with only abandoned/draft orders is still a throwaway; one that took money is archive-only.
3. **R2 objects on archive?** → **Default: leave them** (cheap, reversible); only purge on hard delete. Optionally a bucket lifecycle rule later.
4. **Stripe Connect on delete?** → **Default: detach only**, never remote-delete — it's the merchant's account.
5. **Can the house/`isPlatformOwner` tenant ever be archived/deleted?** → **Default: no, hard-blocked** in API + hidden in UI. (`/shop` + flagship depend on it.)
6. **Does "View store" for a non-live store need a real authenticated preview, or just a labeled link that 404s?** → **Default: labeled link now** (Phase A1); a true operator preview-bypass route is a later nicety.
7. **Should archive cascade to immediately revoking keys, or keep them for fast reactivation?** → **Default: revoke on archive** (security first); re-mint on reactivate.

---

_All claims grounded in: `api/platform/tenants/[id]/route.ts` (GET+PATCH only), `tenants/page.tsx:215-218`, `tenants/[id]/page.tsx`, `schema.prisma:36-70/112-123`, `tenant-prisma.ts:38-73`, `storefront.ts:38`, `impersonate/route.ts:38`, `go-live/route.ts:63`, `lib/r2.ts`._
