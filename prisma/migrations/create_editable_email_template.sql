-- Create fully editable email template table

CREATE TABLE IF NOT EXISTS "WelcomeEmailTemplate" (
  id TEXT PRIMARY KEY DEFAULT 'welcome',
  
  -- Logo & Header
  "logoUrl" TEXT NOT NULL,
  "headerBgColor" TEXT NOT NULL DEFAULT '#f5ede0',
  "cardBgColor" TEXT NOT NULL DEFAULT '#ffffff',
  
  -- Greeting
  "greetingText" TEXT NOT NULL,
  "greetingItalic" BOOLEAN DEFAULT true,
  
  -- Body paragraphs
  "bodyParagraph1" TEXT NOT NULL,
  "bodyParagraph2" TEXT NOT NULL,
  
  -- Bullet section
  "bulletSectionTitle" TEXT NOT NULL,
  "bullet1Label" TEXT NOT NULL,
  "bullet1Text" TEXT NOT NULL,
  "bullet2Label" TEXT NOT NULL,
  "bullet2Text" TEXT NOT NULL,
  "bullet3Label" TEXT NOT NULL,
  "bullet3Text" TEXT NOT NULL,
  
  -- Closing
  "closingText" TEXT NOT NULL,
  
  -- Signature
  "signatureText" TEXT NOT NULL,
  "signatureName" TEXT NOT NULL,
  "signatureSubtitle" TEXT NOT NULL,
  "avatarUrl" TEXT NOT NULL,
  
  -- Social buttons
  "instagramUrl" TEXT NOT NULL,
  "tiktokUrl" TEXT NOT NULL,
  "instagramButtonColor" TEXT NOT NULL DEFAULT '#E4405F',
  "tiktokButtonColor" TEXT NOT NULL DEFAULT '#000000',
  
  -- Colors
  "textColorDark" TEXT NOT NULL DEFAULT '#4a3728',
  "textColorMedium" TEXT NOT NULL DEFAULT '#5a4a3a',
  "textColorLight" TEXT NOT NULL DEFAULT '#a89070',
  "accentColor" TEXT NOT NULL DEFAULT '#c8956c',
  
  -- Metadata
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Seed with EXACT current content
INSERT INTO "WelcomeEmailTemplate" (
  id,
  "logoUrl",
  "greetingText",
  "bodyParagraph1",
  "bodyParagraph2",
  "bulletSectionTitle",
  "bullet1Label",
  "bullet1Text",
  "bullet2Label",
  "bullet2Text",
  "bullet3Label",
  "bullet3Text",
  "closingText",
  "signatureText",
  "signatureName",
  "signatureSubtitle",
  "avatarUrl",
  "instagramUrl",
  "tiktokUrl"
) VALUES (
  'welcome',
  'https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/artisansstories-logo.png',
  'I am so happy you''re here.',
  'I''m Anna, and Artisans'' Stories is my mission to share the incredible talent of my home country, El Salvador, alongside the custom work I do here in the U.S.',
  'This is a collaboration where you play a part, too. In addition to the heritage goods hand-sewn by Lilian in coordination with other artisans, I offer personalized creations from my own studio. My role is to be the maker who brings high-quality designs to life. I use a mix of curated professional design elements, my own creative work, and custom designs provided by you. Want your own logo on a tote? A specific memory engraved on leather? I''m here to make that happen.',
  'By joining this list, you''ll get:',
  'The Stories:',
  'Meet the makers behind the heritage crafts.',
  'Custom Opportunities:',
  'Learn how you can send me your own designs for sublimation and engraving.',
  'The Journey:',
  'Follow along as I head back to El Salvador in just a few days to visit our next artisan!',
  'Thank you for believing that every product—and every custom request—has a story.',
  'With gratitude,',
  'Anna',
  'Founder & Maker, Artisans'' Stories',
  'https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/anna-avatar.png',
  'https://www.instagram.com/artisansstories?igsh=NTc4MTIwNjQ2YQ==',
  'https://www.tiktok.com/@artisansstories'
)
ON CONFLICT (id) DO NOTHING;
