import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

function customerMagicLinkEmail(magicLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in to Artisans' Stories</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#8B6914 0%,#C9A84C 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:2px;text-transform:uppercase;">ARTISANS' STORIES</h1>
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:1px;">Handcrafted with care</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;text-align:center;">
            <h2 style="margin:0 0 12px;font-size:22px;color:#3a2e24;font-weight:600;">Sign in to your account</h2>
            <p style="margin:0 0 28px;font-size:15px;color:#7a6852;line-height:1.6;">Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;">
              <tr>
                <td style="background:linear-gradient(135deg,#8B6914 0%,#C9A84C 100%);border-radius:10px;">
                  <a href="${magicLink}" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.04em;font-family:'Helvetica Neue',Arial,sans-serif;">Sign In to Artisans' Stories</a>
                </td>
              </tr>
            </table>
            <div style="padding:16px 20px;background:#faf7f2;border-radius:8px;border:1px solid #ede8df;">
              <p style="margin:0;font-size:13px;color:#9a876e;line-height:1.5;">If you did not request this, you can safely ignore this email.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;background:#3a2e24;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.6);">Questions? <a href="mailto:hello@artisansstories.com" style="color:#C9A84C;text-decoration:none;">hello@artisansstories.com</a></p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">&copy; ${new Date().getFullYear()} Artisans' Stories. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email: string };
    const { email } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: max 3 tokens per email per 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentTokens = await prisma.magicLinkToken.count({
      where: {
        email: normalizedEmail,
        type: "CUSTOMER",
        createdAt: { gte: fiveMinutesAgo },
      },
    });
    if (recentTokens >= 3) {
      return NextResponse.json({ success: true });
    }

    // Clean up expired tokens for this email
    await prisma.magicLinkToken.deleteMany({
      where: {
        email: normalizedEmail,
        type: "CUSTOMER",
        expiresAt: { lt: new Date() },
      },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.magicLinkToken.create({
      data: {
        token,
        email: normalizedEmail,
        type: "CUSTOMER",
        expiresAt,
      },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
    const magicLink = `${siteUrl}/api/auth/customer/verify?token=${encodeURIComponent(token)}`;
    const fromEmail = process.env.RESEND_FROM ?? "hello@artisansstories.com";

    await resend.emails.send({
      from: `Artisans' Stories <${fromEmail}>`,
      to: [normalizedEmail],
      subject: "Your Artisans' Stories sign-in link",
      html: customerMagicLinkEmail(magicLink),
    });

    return NextResponse.json({ success: true, message: "Check your email for a sign-in link." });
  } catch (err) {
    console.error("Customer magic link error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
