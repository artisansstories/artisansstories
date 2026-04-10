-- Landing Page CMS
-- Allows admin to customize every section of the landing page

CREATE TABLE "LandingPageSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "heroTitle" TEXT NOT NULL DEFAULT 'Welcome to Artisans'' Stories',
  "heroSubtitle" TEXT,
  "heroCTA" TEXT DEFAULT 'Join the Waitlist',
  "heroImageUrl" TEXT,
  "backgroundImageUrl" TEXT,
  "aboutTitle" TEXT DEFAULT 'Our Story',
  "aboutContent" TEXT,
  "aboutImageUrl" TEXT,
  "footerText" TEXT DEFAULT '© 2026 Artisans Stories',
  "footerLinks" JSONB DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LandingPageSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LandingPageSection" (
  "id" TEXT NOT NULL,
  "title" TEXT,
  "content" TEXT,
  "imageUrl" TEXT,
  "layout" TEXT DEFAULT 'text-left', -- text-left, text-right, text-center, image-only
  "backgroundColor" TEXT,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LandingPageSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LandingPageSection_sortOrder_idx" ON "LandingPageSection"("sortOrder");
CREATE INDEX "LandingPageSection_isVisible_idx" ON "LandingPageSection"("isVisible");

-- Seed default landing page settings
INSERT INTO "LandingPageSettings" (id, "heroTitle", "heroSubtitle", "heroCTA", "aboutTitle", "aboutContent", "updatedAt")
VALUES (
  'singleton',
  'Handcrafted treasures from El Salvador',
  'Every piece tells a story. Join our waitlist to be the first to shop when we launch.',
  'Join the Waitlist',
  'Meet Anna',
  'I grew up surrounded by the vibrant artisan culture of El Salvador, where every craft tells a story of heritage, skill, and passion. After moving to the United States, I felt a deep longing to stay connected to my roots and share the beauty of Salvadoran craftsmanship with the world.\n\nArtisans'' Stories was born from that longing—a bridge between the talented artisans of my homeland and those who appreciate handmade, meaningful goods.',
  NOW()
);
