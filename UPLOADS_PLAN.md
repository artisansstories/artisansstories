# UPLOADS_PLAN — Tenant-Isolated Branding Uploads + Detail Sweep

**Status:** build-ready · **Branch:** main · **Author:** Opus (architecture pass) · **Date:** 2026-06-27

---

## Summary

Wayne's ask, decomposed: (1) let operators **upload** logo/favicon in the onboarding Branding
step instead of pasting URLs; (2) store every tenant's images under a **per-tenant key prefix**
so namespaces never collide; (3) **right-size** each asset and **tell users** the exact
dimensions/format/size expected per field; (4) **fix the hardcoded R2 secret** in the
landing-page route; (5) **sweep the platform/onboarding/storefront** surface for the "little
details" and fix them to a higher standard.

The work is **additive**. No schema change is required — `TenantTheme.logoUrl` / `faviconUrl`
already store strings, and the storefront already renders them. Existing flat-key images
(`products/…`, `landing-page/…`) keep working because their URLs are persisted verbatim in the
DB; only **new** uploads get tenant-prefixed keys.

Five gated phases (**U1–U5**), each `tsc` + `build` + full test-suite clean before merge, plus a
new `test-upload-isolation.ts` that proves the server-derived key prefix.

### Verified ground truth (from the live files)
- **Reference uploader** `src/app/api/admin/upload/route.ts`: `POST`, **no auth gate**, accepts
  JPEG/PNG/WebP/HEIC/HEIF, max 10 MB, sharp → 3 webp sizes (2000/800/300 px, q85/85/80), keys
  `products/{ts}-{rand}.webp` (+`-medium`/`-thumb`), R2 creds from `process.env`
  (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`,
  `R2_PUBLIC_URL`), optional Gemini alt text via `OPENROUTER_API_KEY`. Returns
  `{ url, urlThumb, urlMedium, width, height, size, altText }`.
- **Landing-page uploader** `src/app/api/admin/landing-page/upload/route.ts`: `POST`, **no auth
  gate**, **R2 creds hardcoded as string literals (lines 5–9)** incl. live secret access key, **no
  sharp** (raw passthrough), key `landing-page/{field}-{uuid}.{ext}`, returns `{ url }`.
- **Two more uploaders** `src/app/api/admin/email-template/upload-logo/route.ts` and
  `…/upload-avatar/route.ts`: env-var creds **but hardcoded public URL literal** + use
  `R2_BUCKET` (not `R2_BUCKET_NAME`) — **env-name inconsistency**.
- **No shared R2 helper** — `S3Client`/`PutObjectCommand` constructed inline in all four routes.
- **`.env.example` does not document any R2 vars** (only MailerLite + operator email).
- **Wizard** `src/app/platform/(protected)/onboarding/[tenantId]/page.tsx` (single file, steps
  inline). `STEPS` array lines 50–58: create→branding→stripe→products→apiKey→integration→goLive.
  `BrandingStep` lines 396–528; Logo/Favicon are **plain text `<input>`** (lines 495–502); saves
  via `PUT /api/platform/tenants/{tenantId}/theme`.
- **Theme persistence** `src/app/api/platform/tenants/[id]/theme/route.ts` (`PUT`): operator-gated,
  `prisma.tenantTheme.upsert`, validated by `validateThemeInput` in `src/lib/theme.ts`
  (accepts `http(s)://`, `r2://`, or `/path` for logo/favicon).
- **Model** is `TenantTheme` (not "Theme"); `logoUrl String?`, `faviconUrl String?`
  (`prisma/schema.prisma` lines 51–64).
- **Storefront** `src/app/t/[tenantSlug]/layout.tsx`: logo via plain `<img height=40 width=auto>`
  (lines 101–122, falls back to tenant name text); favicon via
  `generateMetadata → icons: { icon: faviconUrl }` (line 33). No `width/height` on img (CLS), no
  `apple-touch-icon`/sizes.
- **Operator gate** `requirePlatformOperator(req)` in `src/lib/platform-session.ts` (lines
  125–153) + `platformAuthErrorResponse` pattern, cookie `as-platform-session`.
- **Scoped Prisma** `src/lib/tenant-prisma.ts` `getTenantPrisma(tenantId)` — `$extends`
  `$allOperations` injects `tenantId`; 32 models in `TENANT_SCOPED_MODELS`.
- **Existing file-upload pattern** already in repo: `src/app/admin/(protected)/settings/page.tsx`
  lines 163–286 — `<input type=file>` → `POST /api/admin/upload` → `update(field, data.url)`.
- **Tests** are `tsx` scripts under `scripts/` run by `scripts/gates.sh`; runner is `npx tsx`.
  Gates today: `npx tsc --noEmit`, `npm run build` (`prisma generate && next build`), and
  `npx tsx scripts/test-*.ts`. Suite: `test-isolation`, `test-admin-scoping`,
  `test-operator-session`, `test-operator-authz`, `test-impersonation`, `test-onboarding`,
  `test-onboarding-train`.

---

## Recommended image specs (field → dimensions / format / max size / notes)

| Field | Recommended source | Accepted formats | Max upload | Stored output | Aspect rule | Rationale |
|---|---|---|---|---|---|---|
| **Logo (header)** | ~**800 × 240 px** (landscape), transparent background | **SVG, PNG (alpha), WebP**; JPEG allowed but no transparency | **2 MB** | SVG → stored **as-is**; raster → **one WebP, max-width 800 px, q90, alpha preserved, no crop** | Landscape, **width ≥ height** (warn if taller than ~1:1; typical 2:1–5:1) | Header renders at `height:40 width:auto`; 2× retina ⇒ ~80 px tall, so 240 px tall source is ample. q90 (vs product q85) keeps logo edges/type crisp. No square crop — logos are wordmarks. SVG is resolution-independent ⇒ pass through. |
| **Favicon** | **512 × 512 px** (square) | **PNG, SVG**; ICO accepted; WebP/JPEG converted | **1 MB** | SVG → as-is; raster → **PNG 256 × 256, `fit:cover` center**; *(optional 32 × 32 PNG for the `<link>`)* | **Square (1:1)** — block/auto-crop if not square | Browsers/PWAs want square icons. **PNG, not WebP**, for icon compatibility (Safari/older agents). 256 covers favicon + apple-touch downscale; cover-crop guarantees square from any input. |
| **Product image** | **~2000 px**, square framing preferred | JPEG/PNG/WebP/HEIC/HEIF (current `ALLOWED_TYPES`) | **10 MB** (current) | **Unchanged**: 3 WebP — full 2000 q85, medium 800 q85, thumb 300 q80; resize by width, **no crop** | Square framing **recommended**, not enforced | Don't regress Artisans' live pipeline. Width-only resize preserves portrait/landscape product shots; 3 sizes already power grid/detail/thumb. |
| **Landing-page hero/section** *(secondary)* | ~2000 px wide | JPEG/PNG/WebP | 10 MB | Route currently raw-passthrough; **align to WebP single-size in U4** (additive) | none | Brings the un-processed landing route up to the WebP standard while fixing its creds. |

**Helper-text strings to surface in the UI (per field):**
- **Logo:** "Transparent **PNG or SVG**, landscape (≈ 800 × 240 px). Max 2 MB. Shown ~40 px tall."
- **Favicon:** "**Square PNG or SVG**, 512 × 512 px recommended. Max 1 MB."
- **Product:** "**Square ~2000 px**, JPEG/PNG/WebP. Max 10 MB. We generate 3 sizes automatically."

---

## Architecture decisions

### AD-1 — New operator-gated endpoint (chosen) vs reuse admin upload via impersonation
**Decision: add `POST /api/platform/tenants/[id]/upload`, gated by `requirePlatformOperator`.**

Why, not impersonation-reuse:
- The admin uploader has **no auth gate today** — reusing it via impersonation would still leave
  it open and would require minting an admin session just to upload a logo. Heavier and worse.
- The operator endpoint reads **`tenantId` from the path param** (already operator-validated via
  the `theme` route pattern: 404 if tenant missing), so the key prefix is **server-derived and
  never client-trusted** — exactly the isolation requirement.
- It mirrors the existing `tenants/[id]/theme`, `…/products`, `…/go-live` family — consistent
  operator surface, consistent `platformAuthErrorResponse` handling.

Request: `multipart/form-data` with `file` + `kind` ∈ `{logo, favicon, product}` (controls
resize rule). Response mirrors the admin uploader shape so the wizard reuses the same handler
ergonomics: `{ url, urlThumb?, urlMedium?, width, height, size, altText? }`.

### AD-2 — Shared R2 helper `src/lib/r2.ts` (new)
Centralize what is copy-pasted in 4 routes: build the `S3Client` from `process.env`, expose
`putObject(key, body, contentType)` and `publicUrl(key)`. All four existing routes refactor to
import it (behavior-preserving). This is the single change that **kills the hardcoded secret**
and the **`R2_BUCKET` vs `R2_BUCKET_NAME` split**. Standardize on **`R2_BUCKET_NAME`** (the
admin uploader's name) and `R2_PUBLIC_URL`; document all five vars in `.env.example`.

### AD-3 — Key scheme (server-derived prefix)
```
tenants/{tenantId}/branding/logo-{ts}-{rand}.webp        (raster logo)
tenants/{tenantId}/branding/logo-{ts}-{rand}.svg         (svg passthrough)
tenants/{tenantId}/branding/favicon-{ts}-{rand}.png      (raster favicon, 256²)
tenants/{tenantId}/branding/favicon-{ts}-{rand}.svg      (svg passthrough)
tenants/{tenantId}/products/{ts}-{rand}.webp (+-medium/-thumb)   (U4 retrofit; NEW only)
```
- `{tenantId}` is taken **only** from the route path (operator endpoint) or the **admin session**
  (admin endpoint, U4) — never from the request body. `{ts}=Date.now()`, `{rand}=base36(6)`,
  matching the current admin uploader.
- **Old flat keys are untouched.** Existing DB URLs (`…/products/…`, `…/landing-page/…`) keep
  resolving against the same bucket/public URL. Additive by construction.

### AD-4 — Per-type resize rules (sharp)
- **logo (raster):** `resize({ width: 800, withoutEnlargement: true })` → `webp({ quality: 90 })`;
  **no crop**, alpha preserved. **SVG:** detect by mime/`image/svg+xml`, skip sharp, store raw.
- **favicon (raster):** `resize(256, 256, { fit: "cover", position: "centre" })` → `png()`.
  **SVG:** store raw. *(Optional 32² `<link>` variant deferred — see Open Questions.)*
- **product:** unchanged 3-size WebP pipeline. Single source of truth for the rule lives next to
  the endpoint so admin + operator paths agree.

### AD-5 — Validation (server authoritative, client advisory)
- **Server (endpoint):** enforce mime allowlist per `kind`, size cap per `kind` (2 MB logo / 1 MB
  favicon / 10 MB product), and **favicon squareness** (read `sharp().metadata()`; reject
  non-square unless cover-crop chosen — we cover-crop, so accept + normalize). Return structured
  `{ error, errors: [...] }` like the theme route.
- **Client (wizard):** pre-flight check on `File.size`/`type` and (for favicon) decoded
  dimensions; **warn** on wrong logo aspect, **block** oversize/wrong-format with the helper text.
  Keep URL paste as a fallback path that still flows through `validateThemeInput`.

### AD-6 — Theme value compatibility
Upload returns an `https://…r2.dev/…` URL, which `validateThemeInput` already accepts, so the
existing `PUT …/theme` persistence is unchanged — the wizard just sets `logoUrl`/`faviconUrl`
from the upload response instead of from typed text.

---

## Detail-sweep punch-list (grouped, file-referenced)

### Group A — Security / config hygiene (→ U1)
- **A1** `src/app/api/admin/landing-page/upload/route.ts:5-9` — **hardcoded R2 account id, access
  key, live secret access key, bucket, public URL**. Move to `src/lib/r2.ts` + env. *(Secret
  rotation is a separate human action — out of scope to rotate; in scope to stop committing.)*
- **A2** `…/email-template/upload-logo/route.ts` & `…/upload-avatar/route.ts` — **hardcoded
  public-URL literal** + use `R2_BUCKET` instead of `R2_BUCKET_NAME`. Unify via the helper.
- **A3** `.env.example` — **add** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (+ note `OPENROUTER_API_KEY` is optional for alt text).
- **A4** `src/app/api/admin/upload/route.ts` — **no auth gate**. Add `requireAdminSession` (the
  admin equivalent used elsewhere) so product uploads are authenticated; also unblocks U4
  tenant-prefix derivation. *(Landing/email routes likewise ungated — gate in U1/U4.)*

### Group B — Branding upload UX (→ U2/U3, the core ask)
- **B1** `onboarding/[tenantId]/page.tsx:495-502` — replace text-only Logo/Favicon inputs with
  **file-pick + drag-drop** widgets; **keep URL paste** as a collapsible fallback.
- **B2** No **live preview** of the chosen logo/favicon — add thumbnail previews (logo on a
  checkerboard to show transparency; favicon at 32/64 px).
- **B3** No **requirements/helper text** — surface the per-field strings from the specs table;
  show derived dimensions after upload.
- **B4** No **upload progress / error / success** state on these fields (the rest of the step has
  `saving`/`saved`/`errs` — match it).
- **B5** Product image in **Step 4 (products)** is seeded/demo only — confirm whether operators
  can attach a real product image during onboarding; if so, route it through the new endpoint with
  `kind=product`. *(Default: out of scope beyond branding — see Open Questions.)*

### Group C — Storefront polish (→ U5)
- **C1** `t/[tenantSlug]/layout.tsx:104-108` — logo `<img>` has **no `width/height`** ⇒ layout
  shift (CLS). Add intrinsic dimensions or a fixed box.
- **C2** Favicon only sets a single `icon` — **add `apple-touch-icon` + sized variants** in
  `generateMetadata` once the favicon pipeline emits known sizes.
- **C3** Logo `alt={tenant.name}` is fine; **audit other storefront images** for alt text / empty
  states while here.

### Group D — Wizard/operator app consistency (→ U5)
- **D1** Empty/loading/error states: confirm Branding step parity with the other steps
  (spinners, disabled buttons, server-error surfacing) after the upload widgets land.
- **D2** Copy consistency: "Logo URL (optional)" → "Logo" once it's an uploader; align
  helper/placeholder copy across logo/favicon/product.
- **D3** Accessibility: `<label>`/`htmlFor` association, focus states, and `aria` on the
  drag-drop dropzones (custom dropzones need keyboard + `role`).
- **D4** Mobile: dropzone + preview layout should not overflow the narrow wizard column
  (the step uses inline-style flex — verify wrap at small widths).

---

## Phases (each gated + shippable)

### U1 — Shared R2 lib + security fix *(Group A)*
**Scope:** Create `src/lib/r2.ts` (client from env, `putObject`, `publicUrl`, standardized on
`R2_BUCKET_NAME`/`R2_PUBLIC_URL`). Refactor all four upload routes to use it — **behavior
unchanged**. Remove hardcoded creds (A1) and hardcoded public URL (A2). Document R2 vars in
`.env.example` (A3). Add `requireAdminSession` to the admin/landing/email upload routes (A4).
**Justification for no schema change:** pure code/config.
**Gates:** `npx tsc --noEmit`; `npm run build`; full suite (`test-isolation`, `test-admin-scoping`,
`test-operator-session`, `test-operator-authz`, `test-impersonation`, `test-onboarding-train`,
`test-onboarding`). **Prove:** `grep` shows zero secret literals; uploads still return the same
URL shape (manual or smoke).

### U2 — Tenant-isolated operator upload endpoint *(AD-1/3/4/5)*
**Scope:** New `src/app/api/platform/tenants/[id]/upload/route.ts` — `requirePlatformOperator`,
resolve+404 tenant (mirror theme route), read `kind`, apply per-type resize rule (AD-4), write
under `tenants/{tenantId}/branding/…` via `src/lib/r2.ts`, return admin-compatible JSON. **New
test** `scripts/test-upload-isolation.ts`: mint operator cookie, POST a tiny generated image for
tenant A and tenant B, assert (a) operator-gated (no cookie → 401), (b) returned key/URL is
prefixed with the **path** tenantId, (c) a body-supplied `tenantId` is **ignored** (prefix still
from path), (d) two tenants never share a prefix. Add it to `scripts/gates.sh`.
**Gates:** `tsc`; `build`; full suite **+ `test-upload-isolation`** green.

### U3 — Wizard Branding upload UI *(Groups B, parts of D)*
**Scope:** In `onboarding/[tenantId]/page.tsx` `BrandingStep`, replace Logo/Favicon text inputs
with file-pick + drag-drop widgets posting to the U2 endpoint; live preview (B2); per-field
requirements helper text from the specs table (B3); upload progress/error/success wired into the
existing `saving/saved/errs` model (B4); **keep URL paste fallback** (B1); a11y + mobile pass on
the new widgets (D3/D4). On success, `set("logoUrl"/"faviconUrl", data.url)` then existing
`save()` persists via `PUT …/theme` (unchanged).
**Gates:** `tsc`; `build`; full suite incl. `test-onboarding` + `test-onboarding-train` (the
wizard E2E must still pass — verify the train step doesn't assert on the old text inputs).

### U4 — Tenant-prefixed keys for NEW product/store uploads *(AD-3, additive)*
**Scope:** In `src/app/api/admin/upload/route.ts` (now authed from U1), derive `tenantId` from the
**admin session** and write new product keys under `tenants/{tenantId}/products/…` (+`-medium`/
`-thumb`). Same for the landing-page route → also bring it onto the **WebP** standard (spec row 4).
**Existing flat-key images untouched** — only new writes change. Reuse the U2 resize helpers.
**Gates:** `tsc`; `build`; full suite; **prove additivity:** existing seeded/DB image URLs still
resolve (smoke); `test-upload-isolation` extended (or a sibling) asserts admin uploads land under
the session tenant's prefix and can't be steered cross-tenant.

### U5 — Detail sweep finish *(Groups C, D)*
**Scope:** Storefront CLS fix on logo img (C1); `apple-touch-icon`/sized favicon links now that
sizes are known (C2); storefront alt/empty-state audit (C3); wizard copy + a11y + mobile
consistency (D1–D4). Keep each fix small and reviewable.
**Gates:** `tsc`; `build`; full suite. Manual storefront check: logo + favicon render for a tenant
with uploaded assets and the text fallback still shows for one without.

### Loop / done-definition
After U5, **re-run the whole sweep** against platform + onboarding + storefront one more time
(Wayne's "loop until better"): any new detail found becomes a U5.x follow-up with its own gate.
Done = punch-list empty **and** every gate green on a clean tree.

---

## Open questions (with sane defaults)

1. **Favicon output format** — *Default:* **PNG 256²** (compatibility) over WebP. Flip to WebP
   only if we drop old-Safari support.
2. **SVG handling** — *Default:* **accept + store raw** for logo & favicon (resolution-independent;
   sharp can't usefully raster-resize them). Reject only if a CSP/sanitization concern is raised
   (SVG can carry script) — if so, sanitize or restrict to PNG.
3. **2× / multi-size logo + 32² favicon link variant** — *Default:* **skip for now** (single
   logo WebP, single 256² favicon). Add if retina logo blur or `<link sizes>` is wanted.
4. **Aspect-ratio enforcement** — *Default:* **warn** on a too-tall logo, **block** wrong
   format/oversize; **auto-cover-crop** favicon (so non-square is accepted, not rejected).
5. **Product upload inside onboarding (B5)** — *Default:* **out of scope** beyond branding;
   endpoint already supports `kind=product` if we later wire Step 4.
6. **Secret rotation** — the leaked R2 secret in `landing-page/upload` **must be rotated by a
   human** (Cloudflare dashboard) after U1 lands; this plan only stops committing it.
7. **`requireAdminSession` import name** — confirm the exact admin-session guard symbol used
   elsewhere before U1/U4 (the admin app has one; verify name/signature at implementation time).

---

UPLOADS_PLAN_WRITTEN

---

## EXECUTION RECORD (shipped)

All five phases executed via gated loop. Author: Wayne Kool. The ask: let operators **upload** logo/favicon (no URL paste required), store every tenant's images under a **server-derived per-tenant key prefix** so namespaces never collide, **right-size + spec** each asset, **kill the committed R2 secret**, and **sweep** the platform/onboarding/storefront surface to a higher standard. **Additive throughout** — no schema change (`TenantTheme.logoUrl`/`faviconUrl` already store strings); existing flat-key images (`products/…`, `landing-page/…`) keep resolving because their URLs are persisted verbatim, and only **new** uploads get tenant-prefixed keys. Upload endpoints stay operator-gated (`requirePlatformOperator`, path-derived `tenantId`) / admin-gated; the auth model is unchanged.

| Phase | Commit | What shipped | Gates |
|---|---|---|---|
| **U1** | `e54c693` | Shared R2 lib (`src/lib/r2.ts`: env-built `S3Client`, `putObject`/`publicUrl`/`isR2Configured`, standardized on `R2_BUCKET_NAME`/`R2_PUBLIC_URL`). All four upload routes refactored onto it — behavior-preserving. **A1** hardcoded account-id/access-key/live-secret/bucket/public-URL removed from `landing-page/upload`; **A2** hardcoded public-URL literal + `R2_BUCKET` split removed from the email routes; **A3** five R2 vars (+ optional `OPENROUTER_API_KEY`) documented in `.env.example`; **A4** admin/landing/email upload routes gated with the admin-session guard. *(Secret rotation is a separate human action.)* | tsc · build · isolation · admin-scoping · operator-session · operator-authz · impersonation · onboarding-train · onboarding |
| **U2** | `823e709` | New operator-gated `POST /api/platform/tenants/[id]/upload` (AD-1/3/4/5): `requirePlatformOperator`, resolve+404 tenant (mirrors `theme`), `kind ∈ {logo,favicon,product}` drives per-type resize — logo→max-w800 q90 WebP alpha-preserved, favicon→256² cover-crop PNG, product→existing 3-size WebP + HEIC + optional alt text; **SVG passthrough** for logo/favicon. **Key prefix is server-derived from the path `[id]` only — a body `tenantId` is ignored.** New gate `test-upload-isolation.ts` proves operator-gating (401), path-prefix derivation, body-`tenantId` ignored, and two tenants never sharing a prefix; added to `scripts/gates.sh`. | tsc · build · full suite **+ upload-isolation** |
| **U3** | `524d689` | Wizard `BrandingStep` (Group B + D3/D4): text Logo/Favicon inputs replaced with `UploadField` — drag-drop + click-to-pick dropzone (`role=button`, `tabIndex`, `aria-label`, `aria-busy`, focus-visible ring), live preview (logo on a checkerboard; favicon at 32/64 px), per-field requirements helper text from the specs table, client pre-validation (size/type block; non-square favicon **warns** — server cover-crops), upload progress/error/success wired into `saving/saved/errs`, derived dims+size on success, **collapsible "paste a URL" fallback** still flowing through `validateThemeInput`. On success: `set(field,url)` then `save({field})` persists via `PUT …/theme` (unchanged). Server faults humanized — never raw JSON. | tsc · build · full suite (incl. onboarding + onboarding-train) |
| **U4** | `ce1d929` | Tenant-prefixed keys for **new** product/store uploads (AD-3, additive): `admin/upload` derives `tenantId` from the **admin session** and writes `tenants/{tenantId}/products/{ts}-{rand}.webp` (+`-medium`/`-thumb`); landing-page route brought onto the same WebP standard + session-derived prefix. Existing flat-key DB URLs untouched. New gate `test-admin-upload-prefix.ts` asserts admin uploads land under the **session** tenant's prefix and can't be steered cross-tenant. | tsc · build · full suite **+ admin-upload-prefix** |
| **U5** | (this) | Detail sweep finish (Groups C, D) + final re-sweep. **C1** storefront logo `<img>` wrapped in a fixed-height (40px) box with intrinsic `height` attr + `maxWidth` → reserves space, kills the sticky-header CLS; text-name fallback kept. **C2** `generateMetadata` favicon now emits a typed `icon` (256² PNG, or SVG with `image/svg+xml`) **plus an `apple-touch-icon`** (raster only) — no-favicon fallback preserved. **C3/D3** product-detail gallery thumbnail buttons (image `alt=""`) given `aria-label`/`aria-pressed` accessible names. **D2** guide copy straggler "a logo URL (optional)" → "a logo or favicon to upload". **D1/D4** confirmed: Branding step has full loading/saving/saved/errs parity + per-field upload states; upload widgets + previews wrap (auto-fit `minmax(240px,1fr)`, favicon 32/64 row) with no overflow in the narrow wizard column. Re-sweep of launcher / onboarding / guide / integration / tenant-detail / storefront found existing empty/error/alt states sound (no raw-JSON surfacing). Execution record (this). | **full suite** |

### Storage key scheme (as shipped, server-derived)
```
tenants/{tenantId}/branding/logo-{ts}-{rand}.webp        (raster logo, max-w800 q90, alpha)
tenants/{tenantId}/branding/logo-{ts}-{rand}.svg         (svg passthrough)
tenants/{tenantId}/branding/favicon-{ts}-{rand}.png      (raster favicon, 256² cover)
tenants/{tenantId}/branding/favicon-{ts}-{rand}.svg      (svg passthrough)
tenants/{tenantId}/products/{ts}-{rand}.webp (+-medium/-thumb)   (U4; NEW writes only)
```
`{tenantId}` is taken **only** from the operator route path (U2) or the admin session (U4) — never the request body. Old flat keys are untouched (additive by construction).

### New surfaces (as shipped)
- **Lib:** `src/lib/r2.ts` (shared R2 client + helpers).
- **Endpoint (operator-gated):** `tenants/[id]/upload` (POST, multipart `{ file, kind }`).
- **Gates added:** `test-upload-isolation` (U2) · `test-admin-upload-prefix` (U4).
- **Config:** `.env.example` documents `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (+ optional `OPENROUTER_API_KEY`).
- **No schema change.** Uploads return `https://…r2.dev/…` URLs that `validateThemeInput` already accepts.

### Follow-ups (NOT done — scoped out of U5)
- **Secret rotation** — the previously-committed R2 secret access key (removed from source in U1) **must still be rotated by a human** in the Cloudflare dashboard. Code-only fix here; the leaked credential remains valid until rotated.
- **Wizard `<label htmlFor>` association** — the onboarding form labels (colors, fonts, radius) are visual-only, not programmatically associated with their inputs. Pervasive pre-existing pattern across the wizard; a correct fix means threading `id`s through every control (incl. the two-input color rows). Larger than a U5 detail-fix — left as a dedicated a11y pass.
- **Tenant-detail Theme card** — shows colors/fonts/radius but not the uploaded logo/favicon thumbnails. Additive nicety, not a defect.
- **Footer "Powered by Simplify"** (`t/[tenantSlug]/layout.tsx`) — reads like a placeholder brand; left unchanged because the intended platform name is a product decision, not a detail-sweep call.
- **B5 product upload inside onboarding Step 4** — endpoint already supports `kind=product`; wiring Step 4's image picker is out of scope (default per Open Questions #5).

### Full gate suite (all green)
`test-isolation` · `test-admin-scoping` · `test-operator-session` · `test-operator-authz` · `test-impersonation` · `test-onboarding-train` · `test-onboarding` · `test-upload-isolation` · `test-admin-upload-prefix`
