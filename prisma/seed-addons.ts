import { config } from 'dotenv';
import * as path from 'path';

// Load env files in priority order
config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Connecting to database...');
  console.log('DATABASE_URL prefix:', process.env.DATABASE_URL?.substring(0, 40) + '...');

  // Find wallet products
  const walletProducts = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: 'wallet', mode: 'insensitive' } },
        { tags: { has: 'wallet' } },
      ]
    }
  });

  console.log(`Found ${walletProducts.length} wallet product(s)`);

  for (const product of walletProducts) {
    await prisma.productAddon.upsert({
      where: { productId_type: { productId: product.id, type: 'LASER_MONOGRAM' } },
      create: {
        productId: product.id,
        type: 'LASER_MONOGRAM',
        isEnabled: true,
        config: {
          fonts: ['Anonymous Pro', 'Happy Monkey', 'Oregano'],
          maxChars: 50,
          styles: ['INITIALS', 'FULL_NAME'],
        },
      },
      update: { isEnabled: true },
    });
    console.log(`Seeded laser monogram addon for: ${product.name}`);
  }

  if (walletProducts.length === 0) {
    console.log('No wallet products found. Addon seed skipped.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
