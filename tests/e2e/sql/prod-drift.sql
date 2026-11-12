-- Tables and columns that exist in production but not in schema.prisma. Some
-- admin services read/write them with raw SQL (landing page, Link Hub), so the
-- throwaway test database needs them after `prisma db push`.
-- Source: prisma/migrations/add_landing_page_cms.sql, add_landing_page_controls.sql,
-- add_linktree_tables.sql, plus columns the services reference that no
-- checked-in migration creates (emailButton*, emailSubText).
-- TEST DATABASE ONLY.

CREATE TABLE IF NOT EXISTS "LandingPageSettings" (
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
ALTER TABLE "LandingPageSettings"
  ADD COLUMN IF NOT EXISTS "midSectionContent" TEXT,
  ADD COLUMN IF NOT EXISTS "showComingSoonBadge" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "comingSoonText" TEXT DEFAULT 'Coming Soon',
  ADD COLUMN IF NOT EXISTS "showLogo" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showHeroImage" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showAboutSection" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showMidSection" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showEmailForm" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showSocialIcons" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "socialLinks" JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "emailButtonText" TEXT,
  ADD COLUMN IF NOT EXISTS "emailButtonColor" TEXT,
  ADD COLUMN IF NOT EXISTS "emailSubText" TEXT;

ALTER TABLE "LinkTreeSettings" ADD COLUMN IF NOT EXISTS "customSlug" TEXT;
