/**
 * seed-tenant-zero.ts — P1 multi-tenant backfill
 *
 * Idempotent. Run with: npx tsx scripts/seed-tenant-zero.ts
 *
 * 1. Upserts the platform-owner ("tenant zero") Tenant: Artisans Stories.
 * 2. Backfills tenantId on every tenant-owned table for any rows where it is
 *    still NULL (the schema also carries a @default so freshly-pushed rows are
 *    already populated — this loop is the belt-and-braces guarantee and what
 *    makes the script safe to re-run).
 * 3. Ensures the StoreSettings singleton belongs to tenant zero.
 * 4. Creates/refreshes a TenantTheme from existing StoreSettings colors.
 * 5. Prints a per-table summary and a final NULL-tenantId count (must be 0).
 *
 * NOTE: the fixed id below MUST match the @default("...") value used on every
 * tenantId field in prisma/schema.prisma.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";

// --- load DATABASE_URL from .env / .env.local (tsx does not do this for us) ---
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
const root = path.resolve(__dirname, "..");
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

const TENANT_ZERO_ID = "tenant_artisans_stories";
const TENANT_ZERO_SLUG = "artisans-stories";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Every tenant-owned table (Prisma maps model name -> same-cased table; no @@map in use).
const TENANT_TABLES = [
  "StoreSettings",
  "AdminUser",
  "MagicLinkToken",
  "Category",
  "Product",
  "ProductOption",
  "ProductVariant",
  "ProductImage",
  "Inventory",
  "InventoryLog",
  "Customer",
  "Address",
  "Order",
  "OrderItem",
  "Fulfillment",
  "Return",
  "ReturnItem",
  "Discount",
  "ShippingZone",
  "ShippingRate",
  "Review",
  "WelcomeEmailTemplate",
  "Artisan",
  "ArtisanImage",
  "ProductArtisan",
  "ProductCategory",
  "LinkTreeSettings",
  "LinkTreeLink",
  "LinkTreeClickLog",
  "ContactMessage",
  "ContactReply",
  "EmailLog",
  "KBArticle",
  "ProductAddon",
  "OrderItemAddon",
];

async function main() {
  console.log("=== P1 tenant-zero backfill ===\n");

  // 1. Upsert the platform-owner tenant with a FIXED id matching the schema default.
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_ZERO_SLUG },
    update: { name: "Artisans Stories", isPlatformOwner: true },
    create: {
      id: TENANT_ZERO_ID,
      slug: TENANT_ZERO_SLUG,
      name: "Artisans Stories",
      isPlatformOwner: true,
    },
  });
  console.log(`Tenant ready: id=${tenant.id} slug=${tenant.slug}\n`);

  if (tenant.id !== TENANT_ZERO_ID) {
    // Pre-existing tenant from an earlier run with a different id — adopt it as the backfill target.
    console.warn(
      `WARNING: existing tenant id (${tenant.id}) differs from schema default (${TENANT_ZERO_ID}).`,
    );
  }
  const targetId = tenant.id;

  // 2 + 3. Backfill tenantId on every tenant-owned table where still NULL.
  console.log("Backfilling NULL tenantId rows:");
  let totalUpdated = 0;
  for (const table of TENANT_TABLES) {
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
      targetId,
    );
    totalUpdated += updated;
    console.log(`  ${table.padEnd(22)} updated ${updated}`);
  }
  console.log(`  -> total rows updated: ${totalUpdated}\n`);

  // 4. Create/refresh a TenantTheme from existing StoreSettings colors.
  const settings = await prisma.storeSettings.findFirst({
    where: { tenantId: targetId },
  });
  const theme = await prisma.tenantTheme.upsert({
    where: { tenantId: targetId },
    update: {},
    create: {
      tenantId: targetId,
      primaryColor: settings?.primaryColor ?? "#8B6914",
      accentColor: settings?.accentColor ?? "#C9A84C",
      fontHeading: settings?.fontHeading ?? "Cormorant Garamond",
      fontBody: settings?.fontBody ?? "Inter",
      logoUrl: settings?.storeLogo ?? null,
      faviconUrl: settings?.storeFavicon ?? null,
    },
  });
  console.log(`TenantTheme ready: id=${theme.id} primary=${theme.primaryColor} accent=${theme.accentColor}\n`);

  // 5. Verify: count any remaining NULL tenantId across all tenant-owned tables.
  let nullTotal = 0;
  for (const table of TENANT_TABLES) {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${table}" WHERE "tenantId" IS NULL`,
    );
    const n = Number(rows[0].n);
    if (n > 0) {
      nullTotal += n;
      console.log(`  !! ${table} still has ${n} NULL tenantId rows`);
    }
  }

  console.log("=== Summary ===");
  console.log(`tenant id          = ${targetId}`);
  console.log(`tenant slug        = ${tenant.slug}`);
  console.log(`tables backfilled  = ${TENANT_TABLES.length}`);
  console.log(`rows updated       = ${totalUpdated}`);
  console.log(`NULL tenantId count = ${nullTotal}`);
  if (nullTotal !== 0) {
    throw new Error(`Backfill incomplete: ${nullTotal} rows still have NULL tenantId`);
  }
  console.log("\nAll existing rows owned by the Artisans Stories tenant. ✅");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
