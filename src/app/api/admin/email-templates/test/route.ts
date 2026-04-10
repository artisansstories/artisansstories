import { NextResponse } from "next/server";
import { Client } from "pg";
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function POST(req: Request) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const { email, templateId } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Fetch template
    await client.connect();
    const result = await client.query(`SELECT * FROM "EmailTemplate" WHERE id = $1`, [templateId]);
    const template = result.rows[0];

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Build email HTML
    const iconEmoji = template.showIcon
      ? template.iconType === "custom" && template.iconUrl
        ? `<img src="${template.iconUrl}" alt="Icon" style="width: 48px; height: 48px; margin-bottom: 16px;" />`
        : getIconEmoji(template.iconType)
      : "";

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${template.preheader ? `<meta name="description" content="${template.preheader}">` : ""}
  <title>${template.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${template.bodyBgColor};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: ${template.headerBgColor}; padding: 32px 24px; text-align: center;">
              ${template.logoUrl ? `<img src="${template.logoUrl}" alt="Logo" style="max-width: 200px; height: auto; margin-bottom: 16px;" />` : ""}
              ${template.showIcon ? `<div style="font-size: 48px; margin-bottom: 8px;">${iconEmoji}</div>` : ""}
              ${template.headlineText ? `<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${template.headlineText}</h1>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px; color: #374151; font-size: 16px; line-height: 1.6;">
              ${template.bodyContent || ""}
            </td>
          </tr>
          ${
            template.showCTA && template.ctaText
              ? `<tr>
            <td style="padding: 0 24px 32px 24px; text-align: center;">
              <a href="${template.ctaUrl || "#"}" style="display: inline-block; padding: 14px 32px; background: ${template.ctaBgColor}; color: ${template.ctaTextColor}; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">${template.ctaText}</a>
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding: 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center; font-size: 13px; color: #6b7280;">
              ${template.footerContent || ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send email
    await sgMail.send({
      to: email,
      from: { email: "hello@artisansstories.com", name: "Artisans' Stories" },
      subject: `[TEST] ${template.subject}`,
      html,
      trackingSettings: {
        clickTracking: { enable: false },
        openTracking: { enable: false },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send test email:", error);
    return NextResponse.json({ error: "Failed to send test email" }, { status: 500 });
  } finally {
    await client.end();
  }
}

function getIconEmoji(iconType: string): string {
  const icons: Record<string, string> = {
    "flag-el-salvador": "🇸🇻",
    envelope: "✉️",
    heart: "❤️",
    star: "⭐",
    sparkles: "✨",
    gift: "🎁",
  };
  return icons[iconType] || "✉️";
}
