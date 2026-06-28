# Platform-Operator vs Store-Admin — Separation Plan

**Status:** blueprint for execution. **Scope:** architecture only; no code in this doc.
**Owner intent (authoritative):** the *platform operator* is an infrastructure super-admin with access to everything across all stores; *store admins* are scoped to exactly one store. Artisans Stories is just a store. Anna is an Artisans store admin, **not** an operator. `Tenant.isPlatformOwner` must stop conferring operator power.

---

## 0. Current state (what the code actually does)

- **Operator power is faked** by `requirePlatformAdmin()` (`src/lib/platform-auth.ts`): a request is "operator" iff it carries a valid `as-admin-session` cookie **and** that admin's tenant has `isPlatformOwner = true`. Because tenant zero (`tenant_artisans_stories`) has `isPlatformOwner = true`, **Anna — an ordinary store SUPER_ADMIN — is silently an operator.** Same inlined check is duplicated in `platform/tenants/[id]/{connect,stripe-status,theme}/route.ts`.
- **The operator UI lives inside the store admin.** `AdminLayoutClient.tsx` NAV_ITEM #27 (`/admin/platform`) renders `admin/(protected)/platform/page.tsx`, sharing the store shell (Dashboard/Products/Orders/Settings).
- **No operator identity, no operator app, no operator session.** There is no `PlatformOperator` model and no `/platform/*` route tree. `/api/platform/**` exists and is the only operator-only surface.
- **Store-admin scoping is real but has 6 leaks.** `getTenantPrismaForAdmin` + the scoped client (`tenant-prisma.ts`) auto-scope every model. But 6 `/api/admin/*` routes still reach for the **global** `@/lib/prisma`. Precise diagnosis below (§3) — 4 are genuine cross-tenant bugs; 2 are flagged-but-safe.
- **Single tenant today.** `resolveTenantFromHost` always returns `DEFAULT_TENANT_ID`, so nothing has leaked in production yet. The moment a 2nd store gets admins, the 4 bugs leak.

---

## 1. Identity & auth model

### Decision: **dedicated `PlatformOperator` table + its own session cookie + its own magic-link flow.** ✅

Operator identity is *fully disjoint* from `AdminUser`. An operator is not a row in any tenant, has no `tenantId`, and authenticates through a separate cookie namespace.

#### Options evaluated

| Option | Verdict | Why |
|---|---|---|
| **A. `PlatformOperator` table + `as-platform-session` cookie** | **CHOSEN** | Cleanly expresses "operator ≠ any store's admin": no tenantId, not an AdminUser, can't be accidentally store-scoped. Distinct cookie → unambiguous gating in `proxy.ts` and in route helpers. Independent future RBAC. Auditable identity (id/email/lastLogin). Mirrors the existing "platform models are separate from tenant-scoped models" design already encoded in `tenant-prisma.ts`. |
| B. `isPlatformOperator` flag on `AdminUser` | Rejected | An operator would still be an `AdminUser` *with a tenantId* — i.e. still a store admin. That is exactly the conflation we are removing. The session cookie would be shared, so `proxy.ts` and helpers can't tell "operator request" from "store-admin request" without a DB round-trip on every call, and one stolen/over-privileged store-admin token becomes an operator token. |
| C. Env allowlist of operator emails | Rejected (except as bootstrap seed input) | No DB identity, no audit, no UI management, brittle. Fine only as the *source* for seeding the first operator row. |

#### Concrete representation

New Prisma models (platform-global, **not** in `TENANT_SCOPED_MODELS`):

```prisma
model PlatformOperator {
  id        String    @id @default(cuid())
  email     String    @unique          // global; NOT @@unique([tenantId,email]) — operators have no tenant
  name      String
  isActive  Boolean   @default(true)
  role      PlatformOperatorRole @default(OPERATOR)  // future-proofing; single value for now
  lastLoginAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model PlatformOperatorToken {           // operator magic-link tokens; no tenantId by design
  id        String   @id @default(cuid())
  token     String   @unique
  email     String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  @@index([email])
  @@index([token])
}

enum PlatformOperatorRole { OPERATOR }
```

A **separate token table** (rather than adding `OPERATOR` to `TokenType` on the tenant-scoped `MagicLinkToken`, whose `tenantId` is required) keeps the operator domain free of any tenant coupling and avoids a nullable-tenantId hack.

#### Authentication

- **Same mechanism (magic link), separate everything else.** New auth lib `src/lib/platform-session.ts`, cookie **`as-platform-session`**, separate JWT (same `NEXTAUTH_SECRET`/HS256), 30-day, claims `{ id, email, name, kind: "operator" }`. Mirrors `admin-auth.ts` but with the distinct cookie name and no `tenantId`.
- New routes `src/app/api/auth/platform/{magic-link,verify,logout,session}/route.ts` — clones of the admin equivalents that read/write `PlatformOperatorToken` + `PlatformOperator` and mint the `as-platform-session` cookie. Login page `src/app/platform/(auth)/login/page.tsx`.
- `requirePlatformOperator(req?)` (new, replaces `requirePlatformAdmin`) verifies the `as-platform-session` cookie, loads the `PlatformOperator` row, asserts `isActive`. Returns `{ id, email, name }`. **No `isPlatformOwner`, no tenant lookup.**

#### Distinguishing the two sessions

Different cookie names, full stop. `as-admin-session` ⇒ store admin (carries `tenantId`); `as-platform-session` ⇒ operator (no tenant). A store-admin cookie confers **zero** platform access and an operator cookie confers **zero** store-admin access. No flag, no shared token, no ambiguity in `proxy.ts`.

---

## 2. App / route topology

### New operator app

```
src/app/platform/
  (auth)/login/page.tsx                 # operator magic-link request UI
  (protected)/
    layout.tsx                          # server: requirePlatformOperator() → redirect /platform/login
    PlatformLayoutClient.tsx            # operator shell + nav (NOT the store shell)
    page.tsx                            # operator dashboard (tenant count, stripe health, recent onboards)
    tenants/page.tsx                    # MOVED from admin/(protected)/platform/page.tsx
    tenants/[id]/page.tsx               # tenant detail: theme, stripe flags, API keys
    stripe/page.tsx                     # Connect status across all tenants
    api-keys/page.tsx                   # key inventory across tenants (optional v1)
    billing/page.tsx                    # platform fees / billing (placeholder)
    settings/page.tsx                   # operator account / operator management (placeholder)
```

Operator nav (its own list, in `PlatformLayoutClient`): **Dashboard · Tenants · Stripe · API Keys · Billing · Settings.** Visually distinct from the store admin so an operator never confuses "the platform" with "a store."

### Auth routes

```
src/app/api/auth/platform/
  magic-link/route.ts    verify/route.ts    logout/route.ts    session/route.ts
```

### API reorg

- **`/api/platform/**` stays operator-only.** It already exists (tenants CRUD, api-keys, connect, stripe-status, theme). The only change is the **gate**: every route swaps the inlined `isPlatformOwner` check / `requirePlatformAdmin` for **`requirePlatformOperator`** (§1). No path moves.
- `/api/admin/**` stays store-admin-only, gated on `as-admin-session`, tenant-scoped (§3).

### Removed from `/admin`

- Delete `src/app/admin/(protected)/platform/page.tsx`.
- Remove NAV_ITEM #27 (`{ href: "/admin/platform", label: "Platform", ... }`) from `AdminLayoutClient.tsx`. The store admin must show **no** platform/tenant-management link.

### `proxy.ts` changes

Add two gates; keep the two existing `/admin` + `/api/admin` gates unchanged. **Ordering matters:** the `/api/platform` gate must sit **before** the existing catch-all `if (pathname.startsWith("/api")) return NextResponse.next()` (today `/api/platform` falls through that allow and relies solely on in-route auth — we add proxy defense-in-depth).

```
// UI: protect /platform/* (except /platform/login + /api/auth/platform/*)
if (pathname.startsWith("/platform") && !isPlatformPublic) {
  const token = request.cookies.get("as-platform-session")?.value;
  verify(token) else redirect("/platform/login?callbackUrl=…")   // mirror admin pattern
}
// API: protect /api/platform/*  (MUST precede the generic /api allow)
if (pathname.startsWith("/api/platform")) {
  const token = request.cookies.get("as-platform-session")?.value;
  verify(token) else 401 JSON
}
```

`isPlatformPublic = pathname === "/platform/login" || startsWith("/api/auth/platform/")`. Proxy only checks JWT validity; identity/`isActive` is enforced by `requirePlatformOperator` in-route (same split the admin side already uses). The cookie verify in proxy is **edge-safe** (jose only) — no DB, matching the existing admin block.

---

## 3. Store-admin scoping

**Single source of truth:** every `/admin` page and `/api/admin` route resolves its tenant through **`resolveTenantFromAdminSession()`** (via `getTenantPrismaForAdmin()`), which reads `as-admin-session` and returns the admin's own `tenantId`. No `/admin` handler may construct a client for any other tenant.

### Fix the 6 flagged routes

Precise diagnosis (verified against source):

| Route | Line | Global-prisma use | Real bug? | Fix |
|---|---|---|---|---|
| `products/route.ts` | `makeUniqueSlug` | `prisma.product.findFirst({where:{slug}})` | **YES** — slug-uniqueness checked across **all** tenants; reads other tenants' rows | thread `db` into `makeUniqueSlug`; use `db.product.findFirst` |
| `products/[id]/route.ts` | 12 | `prisma.product.findFirst({where:{slug, NOT:{id}}})` | **YES** — same cross-tenant slug check. (line 121 `Parameters<typeof prisma.product.update>` is type-only — keep) | use `db` |
| `categories/route.ts` | 11 | `prisma.category.findFirst({where:{slug}})` | **YES** — cross-tenant slug check | use `db` |
| `categories/[id]/route.ts` | 11 | `prisma.category.findFirst({where:{slug, NOT:{id}}})` | **YES** — same. (line 74 type-only — keep) | use `db` |
| `dashboard/route.ts` | 42 | `prisma.$queryRaw` low-stock count | **No** — already hand-scoped with explicit `WHERE "tenantId" = ${tenantId}` | standardize: keep raw (cross-column compare needs it), but source the id from `db.$tenantId`; add comment. No behavior change |
| `orders/[id]/fulfill/route.ts` | 101 | `prisma.magicLinkToken.create({data:{tenantId: db.$tenantId, …}})` | **No** — `MagicLinkToken` is *intentionally* global (keyed by secret token); `tenantId` is passed explicitly. Correct by design | leave as-is; document why it's exempt |

So the actionable security fixes are the **4 slug helpers**. `dashboard` and `fulfill` are confirmed safe; the plan standardizes/annotates them so a future reader doesn't "fix" them wrong. After this, **the only legitimate `@/lib/prisma` imports under `/api/admin/**`** are: (a) raw queries with an explicit tenant filter, and (b) `MagicLinkToken` writes. Everything else goes through the scoped client.

### Harden the default — no tenant-zero by default

`resolveTenantFromAdminSession` currently falls back to `DEFAULT_TENANT_ID` when the `AdminUser` row can't be read:

```ts
return admin?.tenantId ?? DEFAULT_TENANT_ID;   // ← silent tenant-zero default
```

**Change to `return admin?.tenantId ?? null;`** so an unresolvable session yields a 401 in `getTenantPrismaForAdmin` instead of silently serving Artisans' data. This satisfies "no `/admin` path can read tenant-zero by default." (A valid session always embeds `tenantId` post-P2, so this only affects malformed/orphaned sessions — which *should* fail closed.)

---

## 4. Data migration

All steps idempotent; **no destructive drops**; Anna's access preserved.

1. **Schema add (additive only):** `PlatformOperator`, `PlatformOperatorToken`, `PlatformOperatorRole`. `prisma migrate` — pure additions, no column changes to existing tables.
2. **`AdminUser` rows: untouched.** Anna stays `SUPER_ADMIN` of `tenant_artisans_stories`. Every existing store admin keeps exactly their current store scope.
3. **`Tenant.isPlatformOwner`: keep the column, retire its authz meaning.** Do **not** drop it (destructive + still useful as "this is the house store" marker). After §1/§2, **nothing reads it for authorization**. Mark deprecated-for-authz in the schema comment. Tenant zero keeps `isPlatformOwner = true` harmlessly.
4. **Bootstrap the first operator (Wayne):** idempotent seed `scripts/seed-platform-operator.ts`:
   ```ts
   prisma.platformOperator.upsert({
     where: { email: PLATFORM_OPERATOR_EMAIL },   // env, default wayne@…
     update: { isActive: true },
     create: { email: …, name: "Wayne Kool", isActive: true },
   });
   ```
   Wayne then logs in at `/platform/login` (magic link) — never through `/admin`. Document `PLATFORM_OPERATOR_EMAIL` in `.env.example` (do not touch real `.env`).
5. **Anna's operator power is removed by deletion, not by data change.** Today she reaches operator features only via `/admin/platform` + `isPlatformOwner` gating. Once that page/nav is gone (§2) and `/api/platform/**` requires an operator cookie she does not have, she is cleanly a store admin. No row edits needed.

**No backfill of operator rows from `AdminUser`** — operators are explicitly seeded, not derived (that derivation is the bug we're killing).

---

## 5. Backwards-compat & risk

**Preserved (must stay 100% for Anna / Artisans):**
- Entire `/admin/*` store experience, minus the single "Platform" nav item.
- All store data, sessions, the `as-admin-session` cookie, magic-link login.
- Tenant-zero data and `isPlatformOwner = true` (now inert for authz).
- `/api/platform/**` contract (request/response shapes) — only the gate changes.

**Breaks (intended):**
- `/admin/platform` 404s after removal — replaced by `/platform/tenants`.
- Anna (and any non-operator) gets 401/redirect on `/platform/*` and `/api/platform/**` — by design.
- Operators must use the new `/platform/login`; the old "log into store admin to operate the platform" path is gone.

**Migration ordering so prod never half-breaks** (each phase shippable on its own):
- Ship **scoping fixes first** (§3 / Phase P8) — pure security, independent of everything else.
- Ship **operator identity + auth + bootstrap dormant** (P9) — new tables/routes that change *no* existing behavior; verify Wayne can mint an operator session **before** cutover.
- **Cut over atomically** (P10): in one deploy, switch `/api/platform/**` to operator-cookie gating **and** remove `/admin/platform` + nav **and** ship the new `/platform` app + proxy gates. Because Wayne is already bootstrapped (P9), there is no window where the platform is ungovernable.
- **Decommission** (P11): delete dead `isPlatformOwner` authz remnants + docs.

Risk if cutover (P10) split across deploys: removing `/admin/platform` before operator login works would lock everyone out of platform ops. Mitigation: P9 gates on a working operator session; P10 is a single atomic PR.

---

## 6. Phased execution plan

Each phase: scope · files · **GATE** (must pass before merge). Phases are individually shippable.

### P8 — Store-admin scoping hardening *(security-first, fully independent)*
- **Scope:** fix the 4 slug helpers to use the scoped client; standardize `dashboard` raw query to `db.$tenantId`; annotate `fulfill` exemption; flip `resolveTenantFromAdminSession` fallback to `null`.
- **Files:** `api/admin/products/route.ts`, `api/admin/products/[id]/route.ts`, `api/admin/categories/route.ts`, `api/admin/categories/[id]/route.ts`, `api/admin/dashboard/route.ts`, `api/admin/orders/[id]/fulfill/route.ts` (comment only), `src/lib/tenant-context.ts`.
- **GATE:** `npx tsc --noEmit` clean · existing `scripts/test-isolation.ts` still `ISOLATION_PASS` · **NEW** `scripts/test-admin-scoping.ts` (below) `ADMIN_SCOPING_PASS` · `npm run build`.

### P9 — Platform operator identity + auth (dormant infra)
- **Scope:** add `PlatformOperator`/`PlatformOperatorToken`/enum; `src/lib/platform-session.ts`; `api/auth/platform/{magic-link,verify,logout,session}`; `seed-platform-operator.ts`; bootstrap Wayne. No change to existing routes/UI yet.
- **Files:** `prisma/schema.prisma` (+migration), new lib + 4 auth routes + seed, `.env.example`.
- **GATE:** `tsc` clean · `npx prisma migrate` applies cleanly on a copy · seed is idempotent (run twice, one row) · **NEW** `scripts/test-operator-session.ts`: mint operator magic link → verify → cookie minted → `requirePlatformOperator` returns the operator; expired/used token rejected · `npm run build`.

### P10 — Platform app cutover (atomic)
- **Scope:** build `src/app/platform/*` (auth + protected layout + nav + pages, moving the tenants UI out of admin); rewrite `requirePlatformAdmin` → `requirePlatformOperator` and apply in all `/api/platform/**` routes (drop every `isPlatformOwner` read); add `proxy.ts` gates for `/platform` + `/api/platform`; **delete** `admin/(protected)/platform/page.tsx` and NAV_ITEM #27.
- **Files:** new `src/app/platform/**`, `src/lib/platform-auth.ts` (rewrite), `api/platform/tenants/route.ts` + `[id]/route.ts` + `[id]/api-keys/**` + `[id]/{connect,stripe-status,theme}/route.ts`, `src/proxy.ts`, `AdminLayoutClient.tsx`, remove old admin platform page.
- **GATE:** **NEW** `scripts/test-operator-authz.ts` — operator cookie → `/api/platform/tenants` **200**; valid store-admin (`as-admin-session`) cookie → **401**; no cookie → **401**; (proves Anna can no longer operate the platform) · `tsc` clean · `npm run build` (routes `/platform/*` + `/api/auth/platform/*` registered; `/admin/platform` gone) · **manual:** Wayne logs into `/platform`, lists/creates a tenant, mints a key; Anna logs into `/admin`, sees no Platform nav, `/platform` redirects her to `/platform/login`.

### P11 — Decommission & docs
- **Scope:** remove any remaining dead `isPlatformOwner` authz references; deprecation comment on the column; update `scripts/P*-NOTES.md` / handoff; optional operator-management UI in `/platform/settings`.
- **Files:** docs, schema comment, stray references.
- **GATE:** `grep -rn isPlatformOwner src` shows **no authorization read** (only the inert column + comments) · full script suite green (`test-isolation`, `test-admin-scoping`, `test-operator-session`, `test-operator-authz`, `test-onboarding`, `test-api`) · `npm run build`.

### NEW isolation gate — `scripts/test-admin-scoping.ts` (the key acceptance test)
Stands up **two** tenants each with an admin, drives the **HTTP/admin layer** (mint `as-admin-session` per admin), and asserts:
- **operator-can-see-all:** an operator session over `/api/platform/tenants` returns *both* tenants.
- **store-admin-sees-only-own:** admin-A over `/api/admin/products` (and categories/orders/dashboard) returns only A's rows; **never** B's — specifically exercising the formerly-leaky slug/listing paths with a **colliding slug** across tenants (the exact case the global-prisma bug mishandled).
- **cross-write blocked:** admin-A creating a product with a slug that exists in B succeeds independently (per-tenant uniqueness) and does not read/mutate B.
Prints `ADMIN_SCOPING_PASS`, exit 0. This is the regression wall for the whole effort.

---

## 7. Open questions / decisions (with defaults — execution is not blocked)

1. **Operator MFA / login hardening?** *Default:* magic link only for v1 (matches store admin); revisit before multi-operator GA. *Recommend* restricting operator magic-link sends to seeded emails (already implicit — unknown email = silent no-op, same as admin).
2. **One operator or many now?** *Default:* table supports many; seed only Wayne. `PlatformOperatorRole` ships with a single `OPERATOR` value as a forward hook; no RBAC branching yet.
3. **Keep `isPlatformOwner` at all?** *Default:* keep as an inert "house store" marker (non-destructive). Drop in a later, separate migration only if it proves unused.
4. **Should operators reach `/api/admin/**` for a given tenant (impersonation/support)?** *Default:* **no** for v1 — operators manage *infrastructure* via `/api/platform/**`; per-store data access is out of scope. If needed later, add an explicit, audited `/api/platform/tenants/[id]/admin-proxy` rather than widening `/api/admin` gating.
5. **Login routing collision** (`/platform/login` vs `/admin/login`). *Default:* fully separate pages/cookies; no shared "account chooser." A human who is both Anna-the-admin and an operator would use two different logins — correct, since the identities are different.
6. **Proxy edge-runtime DB access.** *Default:* keep proxy JWT-only (no DB); `isActive`/identity enforced in-route by `requirePlatformOperator`, exactly as the admin side already splits responsibilities.
7. **Move `/api/platform` → `/api/operator`?** *Default:* **no** — needless churn; `/api/platform/**` already means "operate the platform." Keep the path; change only the gate.

---

## EXECUTION RECORD (shipped)

All four phases executed via gated loop and deployed to production. Author: Wayne Kool.

| Phase | Commit | What shipped | Gates |
|---|---|---|---|
| **P8** | `90fa75c` | Store-admin tenant-scoping hardening: 4 leaky slug routes → scoped client; `resolveTenantFromAdminSession` fails closed (null); `test-admin-scoping.ts` (colliding-slug). | tsc · isolation · admin-scoping · build |
| **P9** | `548e918` | PlatformOperator + PlatformOperatorToken models; `platform-session.ts` (`as-platform-session` cookie, `requirePlatformOperator`); `/api/auth/platform/{magic-link,verify,logout,session}`; idempotent `seed-platform-operator.ts` (wayne@ + mike@orangeslicesport.com); `safePlatformCallback`. Dormant. | tsc · db push · seed idempotency · operator-session · isolation · admin-scoping · build |
| **P10** | `b407b52` | Atomic cutover: standalone `/platform/*` operator app; `/api/platform/**` re-gated to `requirePlatformOperator`; `/admin/platform` + Platform nav removed; proxy gates for `/platform` + `/api/platform`; **impersonation** (`/api/platform/tenants/[id]/impersonate` + `/impersonate/stop`, audited via `PlatformAuditLog`, banner+Exit in admin shell). | tsc · db push · build · isolation · admin-scoping · operator-session · operator-authz · impersonation |
| **P11** | (this) | Decommission: `isPlatformOwner` confirmed inert for authz (display-only "house store" badge); schema deprecation comment; old `requirePlatformAdmin` fully removed; docs. | full suite |

### Final auth model (as shipped)
- **Platform operator** = row in `PlatformOperator` (no tenant), authenticates at `/platform/login` (magic link), session cookie `as-platform-session`. Lives entirely in `/platform/*`. Operators seeded: wayne@orangeslicesport.com, mike@orangeslicesport.com.
- **Store admin** = `AdminUser` (has `tenantId`), authenticates at `/admin/login`, cookie `as-admin-session`, scoped to exactly one store. Artisans Stories is just a store; Anna is its store admin.
- **Impersonation** = operator-only action minting a tenant-scoped `as-admin-session` with `impersonatedBy` claims; audited; confined by P8 tenant isolation; operator's platform session preserved for return.
- `Tenant.isPlatformOwner` is retained as an inert display marker only — it confers **no** authorization.

### Full gate suite (all green)
`test-isolation` · `test-admin-scoping` · `test-operator-session` · `test-operator-authz` · `test-impersonation`

---

## Onboarding a new store (operator handoff)

Once an operator can log in (above), the path from **nothing → live, sellable store** is the **process train** (see `ONBOARDING_PLAN.md` for the full architecture + execution record). Start here:

- **Launcher:** `/platform/onboarding` — "Start a new store" + a derived list of stores still in progress (anything with `storeEnabled === false`), each resumable at its current step.
- **The train:** `/platform/onboarding/[tenantId]` — a resumable 7-step wizard (Create → Branding → Stripe → Products → API key → Integration → Go live). State is **fully derived** from existing data (`GET /api/platform/tenants/[id]/onboarding-status`) — nothing to save; reopening lands on the right step. Only **Go live** is gated (server re-checks `stripeOnboarded && productCount > 0`).
- **Operator guide:** `/platform/onboarding/guide` — the handbook (Stripe deep-dive, API-key scopes, go-live prerequisites, troubleshooting).
- **Per-tenant integration page:** `/platform/tenants/[id]/integration` — the shippable artifact handed to the merchant's developer (resolved base URL / slug / key prefix / hosted URL / `curl`s + Swagger links). Also linked permanently from the tenant detail page.

Go-live actions are audited in `PlatformAuditLog` (`go-live` / `go-live.revert`), consistent with the impersonation logging above. No schema was added for onboarding — completion is derived, never a stored flag.
