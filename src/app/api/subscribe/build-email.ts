// Email builder that uses database template or falls back to hardcoded
import { Client } from "pg";

interface SocialLink {
  id: string;
  platform: string;
  label: string;
  url: string;
  color: string;
  enabled: boolean;
}

interface SignatureData {
  avatarUrl: string;
  name: string;
  subtitle: string;
  closing: string;
}

interface EmailTemplate {
  logoUrl: string;
  headerBgColor: string;
  cardBgColor: string;
  greetingText: string;
  greetingItalic: boolean;
  bodyHtml: string | null;
  bodyParagraph1: string;
  bodyParagraph2: string;
  bulletSectionTitle: string;
  bullet1Label: string;
  bullet1Text: string;
  bullet2Label: string;
  bullet2Text: string;
  bullet3Label: string;
  bullet3Text: string;
  closingText: string;
  signatureText: string;
  signatureName: string;
  signatureSubtitle: string;
  avatarUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  instagramButtonColor: string;
  tiktokButtonColor: string;
  textColorDark: string;
  textColorMedium: string;
  textColorLight: string;
  accentColor: string;
  socialLinks: SocialLink[] | null;
  signatureData: SignatureData | null;
}

async function fetchTemplateFromDB(): Promise<EmailTemplate | null> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`SELECT * FROM "WelcomeEmailTemplate" WHERE id = 'welcome'`);
    return result.rows[0] as EmailTemplate;
  } catch (error) {
    console.error("Failed to fetch email template from DB:", error);
    return null;
  } finally {
    await client.end();
  }
}

const R2_PUBLIC = "https://pub-0225431098954524b5abd8a1b398b466.r2.dev";

const PLATFORM_ICONS: Record<string, string> = {
  instagram: `<img src="${R2_PUBLIC}/email/instagram-icon.svg" alt="Instagram" width="24" height="24" style="display:block;"/>`,
  tiktok:    `<img src="${R2_PUBLIC}/email/tiktok-icon.svg" alt="TikTok" width="24" height="24" style="display:block;"/>`,
  facebook:  `<span style="font-size:18px;font-weight:700;font-family:Arial,sans-serif;color:#ffffff;line-height:24px;display:block;text-align:center;">f</span>`,
  pinterest: `<span style="font-size:18px;font-weight:700;font-family:Arial,sans-serif;color:#ffffff;line-height:24px;display:block;text-align:center;">P</span>`,
  email:     `<span style="font-size:16px;font-family:Arial,sans-serif;color:#ffffff;line-height:24px;display:block;text-align:center;">✉</span>`,
};

function buildSocialIconsHtml(socialLinks: SocialLink[]): string {
  const enabled = socialLinks.filter((l) => l.enabled);
  if (enabled.length === 0) return "";

  const buttons = enabled
    .map(
      (link) => `
        <td style="padding:0 6px;">
          <a href="${link.url}" style="display:inline-block;width:40px;height:40px;background:${link.color};border-radius:50%;text-decoration:none;vertical-align:middle;line-height:40px;text-align:center;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="40" height="40">
              <tr><td style="text-align:center;vertical-align:middle;">${PLATFORM_ICONS[link.platform] || ""}</td></tr>
            </table>
          </a>
        </td>`
    )
    .join("");

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding-bottom:28px;">
      <tr>
        <td style="text-align:center;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
            <tr>${buttons}</tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export async function buildWelcomeEmail(): Promise<string> {
  const template = await fetchTemplateFromDB();

  if (!template) {
    const { welcomeEmailHtml } = await import('./route');
    return welcomeEmailHtml;
  }

  // Resolve body HTML — use new field if present, else build from legacy
  const bodyHtml =
    template.bodyHtml ||
    `<p style="font-size:15px;color:${template.textColorMedium};line-height:1.75;margin-bottom:16px;">${template.bodyParagraph1}</p>
     <p style="font-size:15px;color:${template.textColorMedium};line-height:1.75;margin-bottom:16px;">${template.bodyParagraph2}</p>
     <p style="font-size:16px;color:${template.textColorDark};font-weight:600;margin-bottom:12px;">${template.bulletSectionTitle}</p>
     <ul style="margin:0 0 20px 0;padding-left:20px;">
       <li style="font-size:15px;color:${template.textColorMedium};line-height:1.75;margin-bottom:8px;"><strong>${template.bullet1Label}</strong> ${template.bullet1Text}</li>
       <li style="font-size:15px;color:${template.textColorMedium};line-height:1.75;margin-bottom:8px;"><strong>${template.bullet2Label}</strong> ${template.bullet2Text}</li>
       <li style="font-size:15px;color:${template.textColorMedium};line-height:1.75;margin-bottom:8px;"><strong>${template.bullet3Label}</strong> ${template.bullet3Text}</li>
     </ul>
     <p style="font-size:15px;color:${template.textColorMedium};line-height:1.75;margin-bottom:16px;">${template.closingText}</p>`;

  // Resolve social links — use new field if present, else build from legacy instagram/tiktok
  const socialLinks: SocialLink[] = template.socialLinks || [
    { id: "instagram", platform: "instagram", label: "Instagram", url: template.instagramUrl, color: template.instagramButtonColor, enabled: true },
    { id: "tiktok",    platform: "tiktok",    label: "TikTok",    url: template.tiktokUrl,    color: template.tiktokButtonColor,    enabled: true },
  ];

  // Resolve signature
  const sig: SignatureData = template.signatureData || {
    avatarUrl: template.avatarUrl,
    name: template.signatureName,
    subtitle: template.signatureSubtitle,
    closing: template.signatureText,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
</head>
<body style="margin:0;padding:0;background:${template.headerBgColor};font-family:Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${template.headerBgColor};">
    <tr>
      <td style="padding:40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">

          <tr>
            <td style="padding-bottom:32px;">
              <div style="height:3px;background:linear-gradient(90deg,transparent,#8b5e3c,${template.accentColor},#8b5e3c,transparent);border-radius:2px;"></div>
            </td>
          </tr>

          <tr>
            <td style="background:${template.cardBgColor};border-radius:12px;padding:40px 32px;border:1px solid rgba(139,94,60,0.12);">

              <!-- Logo -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align:center;padding-bottom:28px;">
                    <img src="${template.logoUrl}" alt="Artisans' Stories" width="320" height="107" style="display:block;margin:0 auto;max-width:320px;height:auto;"/>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align:center;padding-bottom:28px;">
                    <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,${template.accentColor},transparent);margin:0 auto;"></div>
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:17px;color:${template.textColorDark};line-height:1.6;padding-bottom:24px;${template.greetingItalic ? 'font-style:italic;' : ''}text-align:left;">
                    ${template.greetingText}
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;padding-bottom:24px;text-align:left;">
                    ${bodyHtml}
                  </td>
                </tr>
              </table>

              <!-- Social Icons -->
              ${buildSocialIconsHtml(socialLinks)}

              <!-- Divider -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align:center;padding-bottom:24px;">
                    <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,${template.accentColor},transparent);margin:0 auto;"></div>
                  </td>
                </tr>
              </table>

              <!-- Signature -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-right:12px;vertical-align:top;">
                          <img src="${sig.avatarUrl}" alt="${sig.name}" width="48" height="48" style="border-radius:50%;display:block;border:2px solid ${template.accentColor};"/>
                        </td>
                        <td style="vertical-align:top;padding-top:4px;">
                          <div style="font-size:13px;color:${template.textColorLight};font-family:Arial,Helvetica,sans-serif;letter-spacing:0.04em;line-height:1.8;">
                            ${sig.closing}<br/>
                            <span style="color:${template.textColorDark};font-family:Georgia,serif;font-size:18px;font-style:italic;">${sig.name}</span><br/>
                            <span style="color:#8a7a66;font-size:11px;">${sig.subtitle}</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td style="text-align:center;font-size:11px;color:#b8967a;padding-top:28px;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.04em;line-height:1.8;">
              © ${new Date().getFullYear()} Artisans' Stories · El Salvador to the United States<br/>
              <a href="https://artisansstories.com" style="color:#8b5e3c;text-decoration:none;">artisansstories.com</a>
            </td>
          </tr>

          <tr>
            <td style="padding-top:24px;">
              <div style="height:3px;background:linear-gradient(90deg,transparent,#8b5e3c,${template.accentColor},#8b5e3c,transparent);border-radius:2px;"></div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
