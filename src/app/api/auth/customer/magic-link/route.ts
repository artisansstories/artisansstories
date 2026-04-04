import { NextRequest, NextResponse } from 'next/server';
import { createMagicToken } from '@/lib/customer-auth';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function magicLinkEmailHtml(magicLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in to Artisans Stories</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f0e8; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f5f0e8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #8B6914 0%, #C9A84C 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 4px; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: 2px; text-transform: uppercase;">
                Artisans Stories
              </h1>
              <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.8); letter-spacing: 1px;">
                Handcrafted with care
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 40px 32px; text-align: center;">
              <h2 style="margin: 0 0 12px; font-size: 24px; color: #3a2e24; font-weight: 600;">
                Sign in to your account
              </h2>
              <p style="margin: 0 0 28px; font-size: 15px; color: #7a6852; line-height: 1.6;">
                Click the button below to sign in. This link expires in 15 minutes.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 32px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #8B6914 0%, #C9A84C 100%); border-radius: 10px;">
                    <a href="${magicLink}"
                      style="display: inline-block; padding: 16px 40px; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; letter-spacing: 0.04em; font-family: 'Helvetica Neue', Arial, sans-serif;">
                      Sign In to Artisans Stories
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin: 0 0 8px; font-size: 12px; color: #9a876e;">
                Or copy this link into your browser:
              </p>
              <p style="margin: 0 0 28px; font-size: 11px; color: #b09878; word-break: break-all;">
                ${magicLink}
              </p>

              <div style="padding: 16px 20px; background: #faf7f2; border-radius: 8px; border: 1px solid #ede8df;">
                <p style="margin: 0; font-size: 13px; color: #9a876e; line-height: 1.5;">
                  If you didn't request this, you can safely ignore this email. This link will expire in 15 minutes.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background: #3a2e24; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; color: rgba(255,255,255,0.6);">
                Questions? Contact us at
                <a href="mailto:hello@artisansstories.com" style="color: #C9A84C; text-decoration: none;">
                  hello@artisansstories.com
                </a>
              </p>
              <p style="margin: 0; font-size: 11px; color: rgba(255,255,255,0.35);">
                &copy; ${new Date().getFullYear()} Artisans Stories. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const token = await createMagicToken(normalizedEmail);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://artisansstories.com';
    const magicLink = `${siteUrl}/api/auth/customer/verify?token=${encodeURIComponent(token)}`;

    await resend.emails.send({
      from: `Artisans Stories <${process.env.RESEND_FROM ?? 'hello@artisansstories.com'}>`,
      to: [normalizedEmail],
      subject: 'Sign in to Artisans Stories',
      html: magicLinkEmailHtml(magicLink),
    });

    return NextResponse.json({ success: true, message: 'Check your email for a sign-in link.' });
  } catch (err) {
    console.error('Magic link error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
