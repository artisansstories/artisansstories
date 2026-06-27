# P6 — Platform onboarding API + API-key minting: completion notes

## What P6 delivers
A complete platform-operator surface so a new tenant can be **created → themed →
Stripe-connected → issued a scoped API key**, end to end, by a platform admin.
This is what powers the self-serve onboarding handoff to Mike.

## Auth posture (`src/lib/platform-auth.ts`)
All `/api/platform/**` routes are guarded by **`requirePlatformAdmin(req)`**,
which consolidates the check the P4/P5 routes (connect, stripe-status, theme)
inlined:

> A request is authorized only when it carries a **valid admin session** whose
> owning tenant is the **platform owner** (`Tenant.isPlatformOwner = true`,
> i.e. `tenant_artisans_stories`). An arbitrary tenant admin must NOT be able to
> act on an arbitrary tenant id. Tighten to a dedicated platform-operator role
> post-POC.

- `requirePlatformAdmin(req)` returns the `PlatformAdmin` or throws
  `PlatformAuthError` (`401` no/invalid session, `403` not platform owner).
- `platformAuthErrorResponse(err)` maps that error to a JSON response (each route
  catches → returns it → rethrows anything else).
- The helper reads the session JWT from the request's `Cookie` header
  (`as-admin-session`) when present, falling back to `next/headers` `cookies()`.
  Reading off the request makes the routes testable from a standalone tsx script
  (mint a JWT cookie, hand it to a constructed `NextRequest`) **and** works
  unchanged inside a real route handler. JWT is verified with the same
  `NEXTAUTH_SECRET` / HS256 as `src/lib/admin-auth.ts`.

Shared validation lives in `src/lib/platform-tenants.ts` (slug regex, scope
allowlist, checkout-mode / status enums).

## Endpoints (all under `src/app/api/platform/`)

| Method & path | Purpose |
|---|---|
| `POST /tenants` | Create tenant + default `TenantTheme` + default `StoreSettings` (atomic `$transaction`). Validates `name`, `slug` (lowercase/url-safe, **409** if taken), optional `platformFeeBps` (0–10000), `checkoutMode` (`embedded`\|`connect_redirect`). → **201** |
| `GET /tenants` | List tenants: id, slug, name, status, stripeOnboarded, **productCount** (grouped count), createdAt. |
| `GET /tenants/[id]` | Detail: theme, `stripe` flags (connected/accountId/onboarded), `apiKeyCount` + `activeApiKeyCount`, `productCount`. **404** if missing. |
| `PATCH /tenants/[id]` | Update `name` / `status` / `platformFeeBps` / `checkoutMode`. **400** on bad field / no fields. |
| `POST /tenants/[id]/api-keys` | Mint key. Body `{ name, scopes?, env? }`. Default scopes `["store:read","checkout:create"]`. Returns the **RAW token once** + `prefix` + `scopes` + `warning`. Only `keyHash`+`prefix`+`scopes` persisted. → **201** |
| `GET /tenants/[id]/api-keys` | List keys (id, name, prefix, scopes, lastUsedAt, revokedAt, createdAt). **Never** the raw token or hash. |
| `DELETE /tenants/[id]/api-keys/[keyId]` | Revoke (sets `revokedAt`). Tenant-scoped lookup; idempotent. **404** if not found. |

### Scope allowlist
`["store:read","store:write","checkout:create"]`. Unknown scopes → **400**
(`invalid_scopes`). Empty/non-string-array scopes → **400** (`validation_failed`).

### Revoked-key enforcement (verified, no change needed)
`resolveTenantFromApiKey` in `src/lib/tenant-context.ts` already rejects any key
with a non-null `revokedAt` (`if (!key || key.revokedAt) return null;`), so a
revoked key stops authenticating against the v1 API immediately. The onboarding
test exercises this (200 before revoke → 401 after).

## Admin UI
`src/app/admin/(protected)/platform/page.tsx` — a lightweight operator console:
lists tenants, a "New tenant" form, and a per-tenant "Mint API key" modal that
shows the token exactly once with the scope checkboxes. Added a **Platform** nav
entry to `AdminLayoutClient`. Self-contained client component (fetch + inline
styles, matching the existing admin pages); `npm run build` succeeds.

## Verification (all green)
- `npx tsc --noEmit` → 0 errors.
- `npx tsx scripts/test-onboarding.ts` → **ONBOARDING_PASS** (create tenant →
  detail → mint key → call `/api/v1/store/theme` 200 → revoke → same call 401;
  plus no-session 401, duplicate-slug 409, unknown-scope 400, list-no-leak
  guardrails). Cleans up the created tenant + keys + theme + settings in `finally`.
- `npx tsx scripts/test-isolation.ts` → **ISOLATION_PASS** (no regression).
- `npx tsx scripts/test-api.ts` → **API_SMOKE_PASS** (no regression).
- `npm run build` → Compiled successfully; `/admin/platform` + all four
  `/api/platform/tenants*` routes registered.

## Example curl

Platform routes need a platform-owner admin session cookie. Grab it from a
logged-in browser session (`as-admin-session`) and export it:

```bash
COOKIE='as-admin-session=<jwt-from-browser>'
BASE='http://localhost:3000'
```

Create a tenant:
```bash
curl -s -X POST "$BASE/api/platform/tenants" \
  -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -d '{"name":"Mikes Pottery","slug":"mikes-pottery","platformFeeBps":500}'
# → 201 { "id":"clx…", "slug":"mikes-pottery", ... }
```

Mint a scoped API key (raw token shown once):
```bash
curl -s -X POST "$BASE/api/platform/tenants/<TENANT_ID>/api-keys" \
  -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -d '{"name":"Storefront key","scopes":["store:read","checkout:create"]}'
# → 201 { "id":"…", "token":"oss_live_…", "prefix":"oss_live_…",
#         "scopes":[…], "warning":"store this now; it will not be shown again" }
```

Call the v1 storefront API with that key (no admin cookie needed):
```bash
curl -s "$BASE/api/v1/store/theme" \
  -H "Authorization: Bearer oss_live_…"
# → 200 { "tenant":{…}, "theme":{ "primaryColor":"…", … }, … }
```

Revoke the key (subsequent v1 calls → 401):
```bash
curl -s -X DELETE "$BASE/api/platform/tenants/<TENANT_ID>/api-keys/<KEY_ID>" \
  -H "Cookie: $COOKIE"
# → 200 { "id":"…", "revoked":true, "revokedAt":"…" }
```

## Files added
- `src/lib/platform-auth.ts` — `requirePlatformAdmin`, `PlatformAuthError`, `platformAuthErrorResponse`.
- `src/lib/platform-tenants.ts` — slug/scope/enum validation helpers.
- `src/app/api/platform/tenants/route.ts` — create + list.
- `src/app/api/platform/tenants/[id]/route.ts` — detail + patch.
- `src/app/api/platform/tenants/[id]/api-keys/route.ts` — mint + list.
- `src/app/api/platform/tenants/[id]/api-keys/[keyId]/route.ts` — revoke.
- `src/app/admin/(protected)/platform/page.tsx` — operator UI.
- `scripts/test-onboarding.ts` — E2E onboarding test.

## Files touched
- `src/app/admin/(protected)/AdminLayoutClient.tsx` — added Platform nav item.

## Not done (per task scope)
- Did NOT commit; working tree left changed.
- Did NOT touch `.env` / `.env.local`.
