import { NextResponse } from "next/server";
import { Client } from "pg";

export async function GET() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`SELECT * FROM "LandingPageSettings" WHERE id = 'singleton'`);
    return NextResponse.json({ settings: result.rows[0] || null });
  } catch (error) {
    console.error("Failed to fetch landing page settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function POST(req: Request) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const body = await req.json();
    await client.connect();
    
    const result = await client.query(
      `INSERT INTO "LandingPageSettings" (
        id, "heroTitle", "heroSubtitle", "heroCTA", "heroImageUrl", "backgroundImageUrl",
        "aboutTitle", "aboutContent", "aboutImageUrl", "footerText",
        "midSectionContent", "showComingSoonBadge", "comingSoonText",
        "showLogo", "showHeroImage", "showAboutSection", "showMidSection",
        "showEmailForm", "showSocialIcons", "socialLinks",
        "emailButtonText", "emailButtonColor", "emailSubText", "updatedAt"
      )
      VALUES ('singleton', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
      ON CONFLICT (id) DO UPDATE SET
        "heroTitle" = $1,
        "heroSubtitle" = $2,
        "heroCTA" = $3,
        "heroImageUrl" = $4,
        "backgroundImageUrl" = $5,
        "aboutTitle" = $6,
        "aboutContent" = $7,
        "aboutImageUrl" = $8,
        "footerText" = $9,
        "midSectionContent" = $10,
        "showComingSoonBadge" = $11,
        "comingSoonText" = $12,
        "showLogo" = $13,
        "showHeroImage" = $14,
        "showAboutSection" = $15,
        "showMidSection" = $16,
        "showEmailForm" = $17,
        "showSocialIcons" = $18,
        "socialLinks" = $19,
        "emailButtonText" = $20,
        "emailButtonColor" = $21,
        "emailSubText" = $22,
        "updatedAt" = NOW()
      RETURNING *`,
      [
        body.heroTitle,
        body.heroSubtitle || null,
        body.heroCTA,
        body.heroImageUrl || null,
        body.backgroundImageUrl || null,
        body.aboutTitle,
        body.aboutContent || null,
        body.aboutImageUrl || null,
        body.footerText,
        body.midSectionContent || null,
        body.showComingSoonBadge ?? true,
        body.comingSoonText || 'Coming Soon',
        body.showLogo ?? true,
        body.showHeroImage ?? true,
        body.showAboutSection ?? true,
        body.showMidSection ?? true,
        body.showEmailForm ?? true,
        body.showSocialIcons ?? true,
        JSON.stringify(body.socialLinks || []),
        body.emailButtonText || 'Notify Me When We Launch',
        body.emailButtonColor || '#8B6914',
        body.emailSubText || 'No spam, ever · Just our launch announcement',
      ]
    );
    
    return NextResponse.json({ settings: result.rows[0] });
  } catch (error) {
    console.error("Failed to save landing page settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  } finally {
    await client.end();
  }
}
