// Seeds a demo branded tenant for the visual gate / Monday demo.
// Idempotent. Usage: DATABASE_URL=... npx tsx scripts/seed-demo-tenant.ts [slug]
import * as fs from "fs";
import * as path from "path";
function loadEnv(f: string){ if(!fs.existsSync(f))return; for(const l of fs.readFileSync(f,"utf-8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;const k=t.slice(0,i).trim();let v=t.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;} }
loadEnv(path.resolve("./.env.local")); loadEnv(path.resolve("./.env"));

async function main(){
  const { prisma } = await import("../src/lib/prisma");
  const { getTenantPrisma } = await import("../src/lib/tenant-prisma");
  const slug = process.argv[2] || "galarraga-baseball";
  const id = "tenant_demo_" + slug.replace(/[^a-z0-9]+/gi, "_");

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { name: "Galarraga Baseball Academy", status: "ACTIVE" },
    create: { id, slug, name: "Galarraga Baseball Academy", status: "ACTIVE", isPlatformOwner: false, platformFeeBps: 300, checkoutMode: "connect_redirect" },
  });
  await prisma.tenantTheme.upsert({
    where: { tenantId: tenant.id },
    update: { primaryColor: "#ff7a18", secondaryColor: "#0b3d91", accentColor: "#ffd23f", fontHeading: "Poppins", fontBody: "Inter", radius: "lg" },
    create: { tenantId: tenant.id, primaryColor: "#ff7a18", secondaryColor: "#0b3d91", accentColor: "#ffd23f", fontHeading: "Poppins", fontBody: "Inter", radius: "lg" },
  });
  // StoreSettings for the tenant (storeName/description used by storefront)
  const existingSettings = await prisma.storeSettings.findFirst({ where: { tenantId: tenant.id } });
  if (!existingSettings) {
    await prisma.storeSettings.create({ data: { tenantId: tenant.id, storeName: "Galarraga Baseball Academy", storeDescription: "Official team store — gear up for the season.", storeEnabled: true, contactEmail: "store@galarraga.example", primaryColor: "#ff7a18", accentColor: "#ffd23f" } as any });
  }

  const db = getTenantPrisma(tenant.id);
  const products = [
    { slug: "team-jersey", name: "Home Team Jersey", price: 5499, description: "Official on-field home jersey. Moisture-wicking performance fabric.", tags: ["jersey","apparel"], isFeatured: true },
    { slug: "team-cap", name: "Fitted Team Cap", price: 2499, description: "Structured fitted cap with embroidered team logo.", tags: ["hat","apparel"], isFeatured: true },
    { slug: "team-hoodie", name: "Premium Team Hoodie", price: 6499, description: "Heavyweight fleece hoodie for cold game nights.", tags: ["hoodie","apparel"], isFeatured: true },
    { slug: "water-bottle", name: "Team Water Bottle", price: 1899, description: "32oz insulated stainless steel bottle.", tags: ["accessory"], isFeatured: false },
    { slug: "fan-tshirt", name: "Fan T-Shirt", price: 2299, description: "Soft cotton fan tee. Show your team pride.", tags: ["tshirt","apparel"], isFeatured: false },
    { slug: "drawstring-bag", name: "Drawstring Gear Bag", price: 1599, description: "Lightweight cinch bag for practice gear.", tags: ["accessory"], isFeatured: false },
  ];
  for (const p of products){
    const existing = await db.product.findFirst({ where: { slug: p.slug } });
    if (existing) { await db.product.update({ where: { id: existing.id }, data: { name: p.name, price: p.price, description: p.description, status: "ACTIVE", isFeatured: p.isFeatured, tags: p.tags } }); }
    else {
      const created = await db.product.create({ data: { slug: p.slug, name: p.name, price: p.price, description: p.description, status: "ACTIVE", isFeatured: p.isFeatured, tags: p.tags, originCountry: "USA" } as any });
      // a default variant + inventory so it's purchasable / renders price
      await db.productVariant.create({ data: { productId: created.id, name: "Default", optionValues: {}, price: p.price, position: 0 } as any });
    }
  }
  const count = await db.product.count();
  console.log(`DEMO_TENANT_SEEDED slug=${slug} id=${tenant.id} products=${count} theme=orange/navy`);
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
