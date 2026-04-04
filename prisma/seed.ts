import * as path from "path";
import * as fs from "fs";

// Load env files before importing prisma
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
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

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // ─── Store Settings ───────────────────────────────────────────────────────
  await prisma.storeSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      storeName: "Artisans Stories",
      storeDescription:
        "Handmade artisan crafts from El Salvador's most talented artisans.",
      primaryColor: "#8B6914",
      accentColor: "#C9A84C",
      fontHeading: "Cormorant Garamond",
      fontBody: "Inter",
      contactEmail: "hello@artisansstories.com",
      returnPolicyDays: 30,
      storeEnabled: false,
      instagramUrl:
        "https://www.instagram.com/artisansstories?igsh=NTc4MTIwNjQ2YQ==",
      tiktokUrl: "https://www.tiktok.com/@artisansstories",
    },
  });
  console.log("✓ Store settings seeded");

  // ─── Admin User ───────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("artisans2026!", 12);
  await prisma.adminUser.upsert({
    where: { email: "anna@artisansstories.com" },
    update: {},
    create: {
      email: "anna@artisansstories.com",
      name: "Anna Kool",
      password: passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });
  console.log("✓ Admin user seeded (anna@artisansstories.com)");

  // ─── Shipping Zones ───────────────────────────────────────────────────────
  const usDomestic = await prisma.shippingZone.upsert({
    where: { id: "us-domestic" },
    update: {},
    create: {
      id: "us-domestic",
      name: "US Domestic",
      countries: ["US"],
      regions: [],
      isActive: true,
      position: 0,
    },
  });

  // US flat rate
  await prisma.shippingRate.upsert({
    where: { id: "us-flat" },
    update: {},
    create: {
      id: "us-flat",
      zoneId: usDomestic.id,
      name: "Standard Shipping",
      condition: "FLAT",
      price: 899, // $8.99
      isActive: true,
    },
  });

  // US free over $75
  await prisma.shippingRate.upsert({
    where: { id: "us-free-over-75" },
    update: {},
    create: {
      id: "us-free-over-75",
      zoneId: usDomestic.id,
      name: "Free Shipping (orders over $75)",
      condition: "ORDER_VALUE",
      minValue: 7500, // $75.00 in cents
      price: 0,
      isActive: true,
    },
  });

  const international = await prisma.shippingZone.upsert({
    where: { id: "international" },
    update: {},
    create: {
      id: "international",
      name: "International",
      countries: [],
      regions: [],
      isActive: true,
      position: 1,
    },
  });

  await prisma.shippingRate.upsert({
    where: { id: "intl-flat" },
    update: {},
    create: {
      id: "intl-flat",
      zoneId: international.id,
      name: "International Shipping",
      condition: "FLAT",
      price: 2499, // $24.99
      isActive: true,
    },
  });
  console.log("✓ Shipping zones seeded");

  // ─── Categories ───────────────────────────────────────────────────────────
  const categories = [
    { id: "cat-jewelry", slug: "jewelry", name: "Jewelry", position: 0 },
    { id: "cat-textiles", slug: "textiles", name: "Textiles", position: 1 },
    { id: "cat-ceramics", slug: "ceramics", name: "Ceramics", position: 2 },
    {
      id: "cat-home-decor",
      slug: "home-decor",
      name: "Home Decor",
      position: 3,
    },
    {
      id: "cat-accessories",
      slug: "accessories",
      name: "Accessories",
      position: 4,
    },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: {
        id: cat.id,
        slug: cat.slug,
        name: cat.name,
        position: cat.position,
        isActive: true,
      },
    });
  }
  console.log("✓ Categories seeded (Jewelry, Textiles, Ceramics, Home Decor, Accessories)");

  console.log("\nSeeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
