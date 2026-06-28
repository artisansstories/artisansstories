import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromHost } from "@/lib/tenant-context";
import { originFromRequest } from "@/lib/tenant-host";
import { Resend } from "resend";
import crypto from "crypto";
import { getEmailBranding, emailLogoHtml, type EmailBranding } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";

const resend = new Resend(process.env.RESEND_API_KEY);

function customerMagicLinkEmail(magicLink: string, branding: EmailBranding): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in to ${branding.storeName}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="padding:28px 32px;text-align:center;border-bottom:1px solid #ede8df;">
            ${emailLogoHtml(branding)}
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;text-align:center;">
            <h2 style="margin:0 0 12px;font-size:22px;color:#3a2e24;font-weight:600;">Sign in to your account</h2>
            <p style="margin:0 0 28px;font-size:15px;color:#7a6852;line-height:1.6;">Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;">
              <tr>
                <td style="background:${branding.accentColor};border-radius:10px;">
                  <a href="${magicLink}" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.04em;font-family:'Helvetica Neue',Arial,sans-serif;">Sign In to ${branding.storeName}</a>
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
            <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.6);">Questions? <a href="mailto:${branding.fromAddress}" style="color:${branding.accentColor};text-decoration:none;">${branding.fromAddress}</a></p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">&copy; ${new Date().getFullYear()} ${branding.storeName}. All rights reserved.</p>
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

    // Customer login-by-email: resolve the tenant from the request host.
    const tenantId = await resolveTenantFromHost(request);

    // Rate limit: max 3 tokens per email per 5 minutes. MagicLinkToken is keyed
    // by a global secret token, so it stays on the raw client — scoped by
    // tenantId explicitly here.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentTokens = await prisma.magicLinkToken.count({
      where: {
        tenantId,
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
        tenantId,
        email: normalizedEmail,
        type: "CUSTOMER",
        expiresAt: { lt: new Date() },
      },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.magicLinkToken.create({
      data: {
        tenantId,
        token,
        email: normalizedEmail,
        type: "CUSTOMER",
        expiresAt,
      },
    });

    // Use the origin the customer is actually on (tenant subdomain or apex) so
    // the verify link lands on the correct host and the cookie is scoped correctly.
    const siteUrl = originFromRequest(request);
    const magicLink = `${siteUrl}/api/auth/customer/verify?token=${encodeURIComponent(token)}`;

    const branding = await getEmailBranding(tenantId);
    const subject = `Your ${branding.storeName} sign-in link`;
    const mlResult = await resend.emails.send({
      from: branding.from,
      to: [normalizedEmail],
      replyTo: branding.replyTo ?? branding.fromAddress,
      subject,
      html: customerMagicLinkEmail(magicLink, branding),
    });
    await logEmail({ tenantId, type: "MAGIC_LINK_CUSTOMER", toEmail: normalizedEmail, fromEmail: branding.fromAddress, subject, resendId: mlResult.data?.id, relatedType: "CUSTOMER" });

    return NextResponse.json({ success: true, message: "Check your email for a sign-in link." });
  } catch (err) {
    console.error("Customer magic link error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
