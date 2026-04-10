-- Email template CMS with full customization

CREATE TABLE IF NOT EXISTS "EmailTemplate" (
  id TEXT PRIMARY KEY DEFAULT 'welcome',
  "templateName" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "preheader" TEXT,
  "logoUrl" TEXT,
  "headerBgColor" TEXT DEFAULT '#8B6914',
  "bodyBgColor" TEXT DEFAULT '#faf9f6',
  "accentColor" TEXT DEFAULT '#8B6914',
  "iconType" TEXT DEFAULT 'flag-el-salvador',
  "iconUrl" TEXT,
  "headlineText" TEXT,
  "bodyContent" TEXT,
  "ctaText" TEXT,
  "ctaUrl" TEXT,
  "ctaBgColor" TEXT DEFAULT '#8B6914',
  "ctaTextColor" TEXT DEFAULT '#ffffff',
  "footerContent" TEXT,
  "socialLinks" JSONB DEFAULT '[]',
  "showIcon" BOOLEAN DEFAULT true,
  "showCTA" BOOLEAN DEFAULT true,
  "showSocialLinks" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Seed default welcome email template
INSERT INTO "EmailTemplate" (id, "templateName", subject, preheader, "headlineText", "bodyContent", "ctaText", "ctaUrl", "footerContent")
VALUES (
  'welcome',
  'Welcome Email',
  'Welcome to Artisans'' Stories! 🎉',
  'Thank you for joining our journey',
  'Thank you for joining!',
  '<p>We''re thrilled to have you on board.</p><p>You''ll be the first to know when we launch our collection of handcrafted treasures from El Salvador.</p>',
  'Visit Our Website',
  'https://artisansstories.com',
  '<p style="margin: 0; color: #6b7280; font-size: 12px;">© 2026 Artisans'' Stories · El Salvador</p><p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px;">You received this email because you signed up for updates.</p>'
)
ON CONFLICT (id) DO NOTHING;

-- Available icon types: flag-el-salvador, envelope, heart, star, sparkles, gift, custom
