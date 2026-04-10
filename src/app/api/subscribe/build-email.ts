// Email builder that uses database template or falls back to hardcoded
import { Client } from "pg";

interface EmailTemplate {
  logoUrl: string;
  headerBgColor: string;
  cardBgColor: string;
  greetingText: string;
  greetingItalic: boolean;
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

export async function buildWelcomeEmail(): Promise<string> {
  const template = await fetchTemplateFromDB();
  
  if (!template) {
    // Fallback to hardcoded (current working email)
    const { welcomeEmailHtml } = await import('./route');
    return welcomeEmailHtml;
  }

  // Build email from database template
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
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align:center;padding-bottom:28px;">
                    <img src="${template.logoUrl}" alt="Artisans' Stories" width="320" height="107" style="display:block;margin:0 auto;max-width:320px;height:auto;"/>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align:center;padding-bottom:28px;">
                    <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,${template.accentColor},transparent);margin:0 auto;"></div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:17px;color:${template.textColorDark};line-height:1.6;padding-bottom:24px;${template.greetingItalic ? 'font-style:italic;' : ''}text-align:left;">
                    ${template.greetingText}
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;padding-bottom:16px;text-align:left;">
                    ${template.bodyParagraph1}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;padding-bottom:24px;text-align:left;">
                    ${template.bodyParagraph2}
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:16px;color:${template.textColorDark};line-height:1.6;padding-bottom:16px;text-align:left;font-weight:600;">
                    ${template.bulletSectionTitle}
                  </td>
                </tr>
                <tr>
                  <td style="padding-left:20px;padding-bottom:12px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="width:20px;vertical-align:top;padding-top:2px;"><span style="color:${template.accentColor};font-size:16px;">•</span></td>
                        <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;"><strong>${template.bullet1Label}</strong> ${template.bullet1Text}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-left:20px;padding-bottom:12px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="width:20px;vertical-align:top;padding-top:2px;"><span style="color:${template.accentColor};font-size:16px;">•</span></td>
                        <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;"><strong>${template.bullet2Label}</strong> ${template.bullet2Text}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-left:20px;padding-bottom:28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="width:20px;vertical-align:top;padding-top:2px;"><span style="color:${template.accentColor};font-size:16px;">•</span></td>
                        <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;"><strong>${template.bullet3Label}</strong> ${template.bullet3Text}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding-bottom:28px;">
                <tr>
                  <td style="text-align:center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td style="padding:0 8px;">
                          <a href="${template.instagramUrl}" style="display:inline-block;padding:12px 20px;background:${template.instagramButtonColor};color:#ffffff;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-align:center;line-height:1.4;">
                            <img src="https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/instagram-icon.svg" alt="" width="20" height="20" style="vertical-align:middle;margin-right:8px;display:inline-block;"/>
                            Follow on Instagram
                          </a>
                        </td>
                        <td style="padding:0 8px;">
                          <a href="${template.tiktokUrl}" style="display:inline-block;padding:12px 20px;background:${template.tiktokButtonColor};color:#ffffff;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-align:center;line-height:1.4;">
                            <img src="https://pub-0225431098954524b5abd8a1b398b466.r2.dev/email/tiktok-icon.svg" alt="" width="20" height="20" style="vertical-align:middle;margin-right:8px;display:inline-block;"/>
                            Follow on TikTok
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:15px;color:${template.textColorMedium};line-height:1.75;padding-bottom:28px;text-align:left;">
                    ${template.closingText}
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align:center;padding-bottom:24px;">
                    <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,${template.accentColor},transparent);margin:0 auto;"></div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-right:12px;vertical-align:top;">
                          <img src="${template.avatarUrl}" alt="Anna" width="48" height="48" style="border-radius:50%;display:block;border:2px solid ${template.accentColor};"/>
                        </td>
                        <td style="vertical-align:top;padding-top:4px;">
                          <div style="font-size:13px;color:${template.textColorLight};font-family:Arial,Helvetica,sans-serif;letter-spacing:0.04em;line-height:1.8;">
                            ${template.signatureText}<br/>
                            <span style="color:${template.textColorDark};font-family:Georgia,serif;font-size:18px;font-style:italic;">${template.signatureName}</span><br/>
                            <span style="color:#8a7a66;font-size:11px;">${template.signatureSubtitle}</span>
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
