import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DEFAULT_DISCLAIMER = "Each piece is handcrafted by skilled artisans, making every item one-of-a-kind. Natural materials, hand-dyeing, weaving, and hand-finishing mean slight variations in color, texture, size, and pattern from piece to piece — and from the photos shown. These natural differences are not defects; they are the hallmark of authentic handmade craftsmanship and make your piece uniquely yours. We stand behind the quality of every item we sell.";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // Upsert StoreSettings with productDisclaimer
    const settings = await prisma.storeSettings.upsert({
      where: { id: "singleton" },
      update: {
        // Only set if null (don't overwrite existing)
        productDisclaimer: undefined,
      },
      create: {
        id: "singleton",
        productDisclaimer: DEFAULT_DISCLAIMER,
      },
    });

    // If productDisclaimer is null, update it
    if (settings.productDisclaimer === null) {
      await prisma.storeSettings.update({
        where: { id: "singleton" },
        data: { productDisclaimer: DEFAULT_DISCLAIMER },
      });
      console.log("StoreSettings.productDisclaimer seeded with default.");
    } else {
      console.log("StoreSettings.productDisclaimer already set, skipping.");
    }

    console.log("Disclaimer seed complete.");
  } catch (error) {
    console.error("Seed error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
