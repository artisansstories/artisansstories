-- Restore original welcome email content

UPDATE "EmailTemplate"
SET 
  subject = 'Welcome to the story 🇸🇻 | A bridge between heritage and home',
  preheader = 'Thank you for joining our journey',
  "logoUrl" = 'https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/artisansstories-logo.png',
  "headerBgColor" = '#8B6914',
  "bodyBgColor" = '#f5ede0',
  "accentColor" = '#8b5e3c',
  "iconType" = 'flag-el-salvador',
  "headlineText" = '',
  "showIcon" = false,
  "showCTA" = false,
  "updatedAt" = NOW()
WHERE id = 'welcome';
