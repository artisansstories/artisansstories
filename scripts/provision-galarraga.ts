// Provisions the Galarraga demo tenant end-to-end and mints a real API key.
// Prints the raw token ONCE. Idempotent for tenant/theme; always mints a fresh key.
import * as fs from "fs"; import * as path from "path";
function loadEnv(f: string){ if(!fs.existsSync(f))return; for(const l of fs.readFileSync(f,"utf-8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;const k=t.slice(0,i).trim();let v=t.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;} }
loadEnv(path.resolve("./.env.local")); loadEnv(path.resolve("./.env"));

async function main(){
  const { prisma } = await import("../src/lib/prisma");
  const { generateApiKey } = await import("../src/lib/api-key");
  const slug = "galarraga-baseball";
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if(!tenant){ console.error("Galarraga tenant not found — run seed-demo-tenant.ts first"); process.exit(1); }

  // mint a key (store:read + checkout:create)
  const { raw, prefix, keyHash } = generateApiKey("test");
  const key = await prisma.tenantApiKey.create({
    data: { tenantId: tenant.id, name: "Galarraga demo integration key", keyHash, prefix, scopes: ["store:read","checkout:create"] },
  });
  const productCount = await prisma.product.count({ where: { tenantId: tenant.id, status: "ACTIVE" } });
  console.log(JSON.stringify({
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, checkoutMode: tenant.checkoutMode, platformFeeBps: tenant.platformFeeBps },
    apiKey: { id: key.id, prefix: key.prefix, scopes: key.scopes, RAW_TOKEN: raw },
    activeProducts: productCount,
    storefront: `/t/${slug}`,
  }, null, 2));
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
