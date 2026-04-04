import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

function adminMagicLinkEmail(magicLink: string, isInvite: boolean, inviterName?: string, role?: string): string {
  const heading = isInvite
    ? `You've been invited to manage Artisans' Stories`
    : `Your admin access link`;
  const intro = isInvite
    ? `${inviterName ?? "Someone"} has invited you to join the Artisans' Stories admin team${role ? ` as ${role}` : ""}.`
    : `Click below to sign in to your admin panel. This link expires in 15 minutes and can only be used once.`;
  const buttonText = isInvite ? "Accept Invitation and Sign In" : "Sign In to Admin Panel";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#8B6914 0%,#C9A84C 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:2px;text-transform:uppercase;">
              ARTISANS' STORIES
            </h1>
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:1px;">Admin Panel</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;text-align:center;">
            <h2 style="margin:0 0 12px;font-size:22px;color:#3a2e24;font-weight:600;">${heading}</h2>
            <p style="margin:0 0 28px;font-size:15px;color:#7a6852;line-height:1.6;">${intro}</p>
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;">
              <tr>
                <td style="background:linear-gradient(135deg,#8B6914 0%,#C9A84C 100%);border-radius:10px;">
                  <a href="${magicLink}" style="display:inline-block;padding:16px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.04em;font-family:'Helvetica Neue',Arial,sans-serif;">
                    ${buttonText}
                  </a>
                </td>
              </tr>
            </table>
            <div style="padding:16px 20px;background:#faf7f2;border-radius:8px;border:1px solid #ede8df;">
              <p style="margin:0;font-size:13px;color:#9a876e;line-height:1.5;">
                If you did not request this, ignore this email.
              </p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;background:#3a2e24;text-align:center;">
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
    const body = await request.json() as {
      email: string;
      isInvite?: boolean;
      inviterName?: string;
      role?: string;
    };

    const { email, isInvite = false, inviterName, role } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Security: always return 200 regardless of whether admin email exists (for non-invite)
    if (!isInvite) {
      const adminUser = await prisma.adminUser.findUnique({
        where: { email: normalizedEmail },
      });
      if (!adminUser || !adminUser.isActive) {
        // Return 200 to avoid email enumeration
        return NextResponse.json({ success: true });
      }
    }

    // Rate limit: max 3 tokens per email per 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentTokens = await prisma.magicLinkToken.count({
      where: {
        email: normalizedEmail,
        type: "ADMIN",
        createdAt: { gte: fiveMinutesAgo },
      },
    });
    if (recentTokens >= 3) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Clean up expired tokens for this email
    await prisma.magicLinkToken.deleteMany({
      where: {
        email: normalizedEmail,
        type: "ADMIN",
        expiresAt: { lt: new Date() },
      },
    });

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + (isInvite ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000));

    await prisma.magicLinkToken.create({
      data: {
        token,
        email: normalizedEmail,
        type: "ADMIN",
        expiresAt,
      },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://artisansstories.com";
    const magicLink = `${siteUrl}/api/auth/admin/verify?token=${encodeURIComponent(token)}`;
    const fromEmail = process.env.RESEND_FROM ?? "hello@artisansstories.com";

    const subject = isInvite
      ? "You have been invited to manage Artisans' Stories"
      : "Your Artisans' Stories admin access link";

    await resend.emails.send({
      from: `Artisans' Stories <${fromEmail}>`,
      to: [normalizedEmail],
      subject,
      html: adminMagicLinkEmail(magicLink, isInvite, inviterName, role),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin magic link error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
