# P2 route refactor spec (TEMPORARY — delete after P2)

Goal: make every tenant-owned Prisma query go through a tenant-SCOPED client so
isolation is enforced. Behavior must stay IDENTICAL (one tenant today).

## The scoped client
`src/lib/tenant-prisma.ts` exports `getTenantPrisma(tenantId)` → a Prisma client
that auto-injects `tenantId` into where/data for these 34 SCOPED models:

StoreSettings, AdminUser, Category, Product, ProductOption, ProductVariant,
ProductImage, Inventory, InventoryLog, Customer, Address, Order, OrderItem,
Fulfillment, Return, ReturnItem, Discount, ShippingZone, ShippingRate, Review,
WelcomeEmailTemplate, Artisan, ArtisanImage, ProductArtisan, ProductCategory,
LinkTreeSettings, LinkTreeLink, LinkTreeClickLog, ContactMessage, ContactReply,
EmailLog, KBArticle, ProductAddon, OrderItemAddon.

NOT scoped (keep on raw `prisma`): Tenant, TenantApiKey, TenantTheme,
MagicLinkToken.

`src/lib/tenant-context.ts` exports:
- `getTenantPrismaForAdmin()` → resolves tenant from admin session cookie. Use in
  ALL `src/app/api/admin/**` routes.
- `getTenantPrismaForHost(req)` → resolves tenant from host (tenant zero today).
  Use in storefront/public routes: `shop/**`, `checkout/**`, `account/**`.

## Transformation per handler (GET/POST/PATCH/PUT/DELETE)
1. As the FIRST statement inside the handler's existing `try { ... }`, add:
   - admin route:   `const db = await getTenantPrismaForAdmin();`
   - storefront:    `const db = await getTenantPrismaForHost(request);`
     (if the handler has no `request`/`req` param, call `getTenantPrismaForHost()`)
   Several handlers have blank leftover lines at the top of the try — put it there.
2. Replace `prisma.<model>.<op>(...)` → `db.<model>.<op>(...)` for every SCOPED
   model (see list). Also replace `prisma.$transaction(...)` → `db.$transaction(...)`
   when the transaction body touches scoped models.
3. KEEP `prisma.` (raw) ONLY for non-scoped models: `prisma.magicLinkToken.*`,
   `prisma.tenant.*`, `prisma.tenantApiKey.*`, `prisma.tenantTheme.*`. If a file
   uses ONLY scoped models, remove the now-unused `import { prisma }` line. If it
   still uses a raw model, KEEP the prisma import (file then imports BOTH).
4. Imports: add
   `import { getTenantPrismaForAdmin } from "@/lib/tenant-context";` (admin) or
   `import { getTenantPrismaForHost } from "@/lib/tenant-context";` (storefront).
   Match the file's existing quote style (some use single quotes).
5. logEmail(...) calls: add a `tenantId` field is NOT required here (it defaults).
   Leave logEmail calls unchanged UNLESS the handler already has a `tenantId` in
   scope — then you may pass it. Default: leave unchanged.

## CRITICAL correctness rules
- Do NOT change response shapes, status codes, validation, or business logic.
- Do NOT touch nested relation writes here (e.g. `order.create({ data: { items:
  { create: [...] } } })`). Those are handled separately. Just swap the top-level
  client. (After this refactor a global `tsc` pass flags any nested create that
  needs an explicit tenantId.)
- `findUnique`/`findUniqueOrThrow` on a scoped model: just swap `prisma`→`db`. The
  scoped client merges tenantId into the unique where automatically. Do not change
  to findFirst.
- If a handler does NOT touch any scoped model (e.g. only S3 upload, only Stripe),
  leave it untouched (no db, no import change).
- Preserve all comments and formatting around the lines you change.

## Example (admin)
BEFORE:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() {
  try {
    const cats = await prisma.category.findMany({ orderBy: { position: "asc" } });
    return NextResponse.json({ cats });
  } catch (e) { return NextResponse.json({ error: "Server error" }, { status: 500 }); }
}
```
AFTER:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getTenantPrismaForAdmin } from "@/lib/tenant-context";
export async function GET() {
  try {
    const db = await getTenantPrismaForAdmin();
    const cats = await db.category.findMany({ orderBy: { position: "asc" } });
    return NextResponse.json({ cats });
  } catch (e) { return NextResponse.json({ error: "Server error" }, { status: 500 }); }
}
```
(`NextRequest` import becomes unused in this example — if so, drop it from the
import to keep tsc/eslint clean, but ONLY if it's genuinely unused.)
