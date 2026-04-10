import { NextResponse } from "next/server";
import { Client } from "pg";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`SELECT * FROM "EmailTemplate" WHERE id = $1`, [params.id]);
    return NextResponse.json({ template: result.rows[0] || null });
  } catch (error) {
    console.error("Failed to fetch email template:", error);
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const body = await req.json();
    await client.connect();

    const result = await client.query(
      `INSERT INTO "EmailTemplate" (
        id, "templateName", subject, preheader, "logoUrl", "headerBgColor", "bodyBgColor", "accentColor",
        "iconType", "iconUrl", "headlineText", "bodyContent", "ctaText", "ctaUrl", "ctaBgColor", "ctaTextColor",
        "footerContent", "socialLinks", "showIcon", "showCTA", "showSocialLinks", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
      ON CONFLICT (id) DO UPDATE SET
        "templateName" = $2,
        subject = $3,
        preheader = $4,
        "logoUrl" = $5,
        "headerBgColor" = $6,
        "bodyBgColor" = $7,
        "accentColor" = $8,
        "iconType" = $9,
        "iconUrl" = $10,
        "headlineText" = $11,
        "bodyContent" = $12,
        "ctaText" = $13,
        "ctaUrl" = $14,
        "ctaBgColor" = $15,
        "ctaTextColor" = $16,
        "footerContent" = $17,
        "socialLinks" = $18,
        "showIcon" = $19,
        "showCTA" = $20,
        "showSocialLinks" = $21,
        "updatedAt" = NOW()
      RETURNING *`,
      [
        params.id,
        body.templateName,
        body.subject,
        body.preheader || null,
        body.logoUrl || null,
        body.headerBgColor,
        body.bodyBgColor,
        body.accentColor,
        body.iconType,
        body.iconUrl || null,
        body.headlineText || null,
        body.bodyContent || null,
        body.ctaText || null,
        body.ctaUrl || null,
        body.ctaBgColor,
        body.ctaTextColor,
        body.footerContent || null,
        JSON.stringify(body.socialLinks || []),
        body.showIcon ?? true,
        body.showCTA ?? true,
        body.showSocialLinks ?? false,
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
