import "dotenv/config";
import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });

const DEFAULT_SOCIAL_LINKS = [
  { id: "instagram", platform: "instagram", label: "Instagram", url: "https://instagram.com/artisansstories", color: "#E4405F", enabled: true },
  { id: "tiktok",    platform: "tiktok",    label: "TikTok",    url: "https://tiktok.com/@artisansstories",  color: "#000000", enabled: true },
  { id: "facebook",  platform: "facebook",  label: "Facebook",  url: "https://facebook.com/artisansstories", color: "#1877F2", enabled: false },
  { id: "pinterest", platform: "pinterest", label: "Pinterest", url: "https://pinterest.com/artisansstories", color: "#E60023", enabled: false },
  { id: "email",     platform: "email",     label: "Email",     url: "mailto:anna@artisansstories.com",       color: "#8B6914", enabled: true },
];

async function migrate() {
  await client.connect();
  console.log("Connected to database");

  // 1. Add new columns
  await client.query(`ALTER TABLE "WelcomeEmailTemplate" ADD COLUMN IF NOT EXISTS "bodyHtml" TEXT`);
  await client.query(`ALTER TABLE "WelcomeEmailTemplate" ADD COLUMN IF NOT EXISTS "socialLinks" JSONB`);
  await client.query(`ALTER TABLE "WelcomeEmailTemplate" ADD COLUMN IF NOT EXISTS "signatureData" JSONB`);
  console.log("Columns added (or already exist)");

  // 2. Migrate bodyHtml from existing paragraph/bullet/closing fields
  await client.query(`
    UPDATE "WelcomeEmailTemplate"
    SET "bodyHtml" =
      '<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">'
        || COALESCE("bodyParagraph1", '') || '</p>' ||
      '<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">'
        || COALESCE("bodyParagraph2", '') || '</p>' ||
      '<p style="font-size:16px;color:#4a3728;font-weight:600;margin-bottom:12px;">'
        || COALESCE("bulletSectionTitle", '') || '</p>' ||
      '<ul style="margin:0 0 20px 0;padding-left:20px;">' ||
        '<li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:8px;"><strong>'
          || COALESCE("bullet1Label", '') || '</strong> ' || COALESCE("bullet1Text", '') || '</li>' ||
        '<li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:8px;"><strong>'
          || COALESCE("bullet2Label", '') || '</strong> ' || COALESCE("bullet2Text", '') || '</li>' ||
        '<li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:8px;"><strong>'
          || COALESCE("bullet3Label", '') || '</strong> ' || COALESCE("bullet3Text", '') || '</li>' ||
      '</ul>' ||
      '<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">'
        || COALESCE("closingText", '') || '</p>'
    WHERE "bodyHtml" IS NULL
  `);
  console.log("bodyHtml migrated");

  // 3. Migrate socialLinks (seed defaults where null)
  await client.query(
    `UPDATE "WelcomeEmailTemplate" SET "socialLinks" = $1::jsonb WHERE "socialLinks" IS NULL`,
    [JSON.stringify(DEFAULT_SOCIAL_LINKS)]
  );
  console.log("socialLinks migrated");

  // 4. Migrate signatureData from existing fields
  await client.query(`
    UPDATE "WelcomeEmailTemplate"
    SET "signatureData" = jsonb_build_object(
      'avatarUrl', COALESCE("avatarUrl", ''),
      'name',      COALESCE("signatureName", ''),
      'subtitle',  COALESCE("signatureSubtitle", ''),
      'closing',   COALESCE("signatureText", '')
    )
    WHERE "signatureData" IS NULL
  `);
  console.log("signatureData migrated");

  await client.end();
  console.log("Migration complete!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
