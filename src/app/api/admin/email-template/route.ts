import { NextResponse } from "next/server";
import { Client } from "pg";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`SELECT * FROM "WelcomeEmailTemplate" WHERE id = 'welcome'`);
    return NextResponse.json({ template: result.rows[0] || null });
  } catch (error) {
    console.error("Failed to fetch email template:", error);
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
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
      `UPDATE "WelcomeEmailTemplate"
       SET
         "logoUrl" = $1,
         "headerBgColor" = $2,
         "cardBgColor" = $3,
         "greetingText" = $4,
         "greetingItalic" = $5,
         "bodyParagraph1" = $6,
         "bodyParagraph2" = $7,
         "bulletSectionTitle" = $8,
         "bullet1Label" = $9,
         "bullet1Text" = $10,
         "bullet2Label" = $11,
         "bullet2Text" = $12,
         "bullet3Label" = $13,
         "bullet3Text" = $14,
         "closingText" = $15,
         "signatureText" = $16,
         "signatureName" = $17,
         "signatureSubtitle" = $18,
         "avatarUrl" = $19,
         "instagramUrl" = $20,
         "tiktokUrl" = $21,
         "instagramButtonColor" = $22,
         "tiktokButtonColor" = $23,
         "textColorDark" = $24,
         "textColorMedium" = $25,
         "textColorLight" = $26,
         "accentColor" = $27,
         "bodyHtml" = $28,
         "socialLinks" = $29::jsonb,
         "signatureData" = $30::jsonb,
         "updatedAt" = NOW()
       WHERE id = 'welcome'
       RETURNING *`,
      [
        body.logoUrl,
        body.headerBgColor,
        body.cardBgColor,
        body.greetingText,
        body.greetingItalic ?? true,
        body.bodyParagraph1,
        body.bodyParagraph2,
        body.bulletSectionTitle,
        body.bullet1Label,
        body.bullet1Text,
        body.bullet2Label,
        body.bullet2Text,
        body.bullet3Label,
        body.bullet3Text,
        body.closingText,
        body.signatureText,
        body.signatureName,
        body.signatureSubtitle,
        body.avatarUrl,
        body.instagramUrl,
        body.tiktokUrl,
        body.instagramButtonColor || '#E4405F',
        body.tiktokButtonColor || '#000000',
        body.textColorDark || '#4a3728',
        body.textColorMedium || '#5a4a3a',
        body.textColorLight || '#a89070',
        body.accentColor || '#c8956c',
        body.bodyHtml,
        body.socialLinks ? JSON.stringify(body.socialLinks) : null,
        body.signatureData ? JSON.stringify(body.signatureData) : null,
      ]
    );

    return NextResponse.json({ template: result.rows[0] });
  } catch (error) {
    console.error("Failed to save email template:", error);
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  } finally {
    await client.end();
  }
}
