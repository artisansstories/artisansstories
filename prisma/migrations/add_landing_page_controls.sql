-- Add full control over landing page sections

ALTER TABLE "LandingPageSettings"
  ADD COLUMN "midSectionContent" TEXT,
  ADD COLUMN "showComingSoonBadge" BOOLEAN DEFAULT true,
  ADD COLUMN "comingSoonText" TEXT DEFAULT 'Coming Soon',
  ADD COLUMN "showLogo" BOOLEAN DEFAULT true,
  ADD COLUMN "showHeroImage" BOOLEAN DEFAULT true,
  ADD COLUMN "showAboutSection" BOOLEAN DEFAULT true,
  ADD COLUMN "showMidSection" BOOLEAN DEFAULT true,
  ADD COLUMN "showEmailForm" BOOLEAN DEFAULT true,
  ADD COLUMN "showSocialIcons" BOOLEAN DEFAULT true,
  ADD COLUMN "socialLinks" JSONB DEFAULT '[]';

-- Example socialLinks structure:
-- [
--   { "platform": "instagram", "url": "https://instagram.com/..." },
--   { "platform": "tiktok", "url": "https://tiktok.com/@..." },
--   { "platform": "email", "value": "hello@example.com" }
-- ]

-- Update existing row with default mid-section content
UPDATE "LandingPageSettings"
SET 
  "midSectionContent" = '<p>Be among the first to join and be part of the journey.</p><p>We''re putting the finishing touches on something special — handcrafted goods from El Salvador''s most talented artisans.</p><p>Every product has a story, and we are so excited to share those products and stories with you…</p>',
  "socialLinks" = '[
    {"platform":"instagram","url":"https://www.instagram.com/artisansstories?igsh=NTc4MTIwNjQ2YQ=="},
    {"platform":"tiktok","url":"https://www.tiktok.com/@artisansstories"}
  ]'::jsonb
WHERE id = 'singleton';
