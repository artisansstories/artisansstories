import { Client } from "pg";

export const runtime = "nodejs";

async function getEmailTemplate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`SELECT * FROM "EmailTemplate" WHERE id = 'welcome'`);
    return result.rows[0];
  } catch (error) {
    console.error("Failed to fetch email template:", error);
    return null;
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

async function buildWelcomeEmail() {
  const template = await getEmailTemplate();
  
  if (!template) {
    // Fallback to basic template if DB query fails
    return {
      subject: "Welcome to Artisans' Stories! 🎉",
      html: `<p>Thank you for joining our journey!</p><p>We'll be in touch soon with updates from El Salvador.</p>`,
    };
  }

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
  <style>
    /* Reset styles */
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    p { margin: 0; padding: 0; }
    /* Email-specific styles */
    a { color: ${template.accentColor}; text-decoration: underline; }
    a:hover { text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: ${template.bodyBgColor};">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background: ${template.bodyBgColor};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background: ${template.headerBgColor}; padding: 32px 24px; text-align: center;">
              ${template.logoUrl ? `<img src="${template.logoUrl}" alt="Logo" style="max-width: 200px; height: auto; margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;" />` : ""}
              ${template.showIcon ? `<div style="font-size: 48px; margin-bottom: 8px;">${iconEmoji}</div>` : ""}
              ${template.headlineText ? `<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; line-height: 1.3;">${template.headlineText}</h1>` : ""}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 24px; color: #374151; font-size: 16px; line-height: 1.6;">
              ${template.bodyContent || ""}
            </td>
          </tr>
          <!-- CTA -->
          ${
            template.showCTA && template.ctaText
              ? `<tr>
            <td style="padding: 0 24px 32px 24px; text-align: center;">
              <a href="${template.ctaUrl || "#"}" style="display: inline-block; padding: 14px 32px; background: ${template.ctaBgColor}; color: ${template.ctaTextColor}; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; line-height: 1.4;">${template.ctaText}</a>
            </td>
          </tr>`
              : ""
          }
          <!-- Footer -->
          <tr>
            <td style="padding: 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center; font-size: 13px; color: #6b7280; line-height: 1.6;">
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

  return {
    subject: template.subject,
    html,
  };
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return Response.json({ error: "Valid email required" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Email service not configured" }, { status: 500 });
    }

    const audienceId = process.env.RESEND_AUDIENCE_ID;

    // Add to Resend audience if configured
    if (audienceId) {
      const contactRes = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
      if (!contactRes.ok && contactRes.status !== 409) {
        console.error("Resend contact error:", await contactRes.text());
      }
    }

    // Build and send welcome email
    const { subject, html } = await buildWelcomeEmail();

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Anna at Artisans' Stories <hello@artisansstories.com>",
        to: [email],
        subject,
        html,
      }),
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error("Subscribe error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
