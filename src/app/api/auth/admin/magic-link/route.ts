import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-prisma";
import { resolveTenantFromHost, originFromRequest } from "@/lib/tenant-context";
import { Resend } from "resend";
import crypto from "crypto";
import { getEmailBranding, emailLogoHtml, type EmailBranding } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
import { safeAdminCallback } from "@/lib/safe-callback";

const resend = new Resend(process.env.RESEND_API_KEY);

function adminMagicLinkEmail(magicLink: string, branding: EmailBranding): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin sign in — ${branding.storeName}</title>
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
            <h2 style="margin:0 0 12px;font-size:22px;color:#3a2e24;font-weight:600;">Admin Sign In</h2>
            <p style="margin:0 0 28px;font-size:15px;color:#7a6852;line-height:1.6;">Click the button below to access the ${branding.storeName} admin. This link expires in 15 minutes and can only be used once.</p>
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;">
              <tr>
                <td style="background:${branding.accentColor};border-radius:10px;">
                  <a href="${magicLink}" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.04em;font-family:'Helvetica Neue',Arial,sans-serif;">Sign In to Admin</a>
                </td>
              </tr>
            </table>
            <div style="padding:16px 20px;background:#faf7f2;border-radius:8px;border:1px solid #ede8df;">
              <p style="margin:0;font-size:13px;color:#9a876e;line-height:1.5;">If you did not request this, you can safely ignore this email. Someone may have entered your address by mistake.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;background:#3a2e24;text-align:center;">
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
    const body = await request.json() as { email: string; callbackUrl?: string };
    const email = (body.email ?? "").toLowerCase().trim();
    const callbackUrl = safeAdminCallback(body.callbackUrl);

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    // Admin login-by-email: resolve the tenant from the request host.
    const tenantId = await resolveTenantFromHost(request);
    const db = getTenantPrisma(tenantId);

    // Check DB — always return success to avoid leaking which emails are allowed
    const adminUser = await db.adminUser.findFirst({ where: { email } });
    if (!adminUser || !adminUser.isActive) {
      return NextResponse.json({ success: true });
    }

    // Rate limit: max 3 tokens per email per 5 minutes. MagicLinkToken is keyed
    // by a global secret token, so it stays on the raw client — we scope these
    // by tenantId explicitly.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentTokens = await prisma.magicLinkToken.count({
      where: { tenantId, email, type: "ADMIN", createdAt: { gte: fiveMinutesAgo } },
    });
    if (recentTokens >= 3) {
      return NextResponse.json({ success: true });
    }

    // Clean up expired tokens
    await prisma.magicLinkToken.deleteMany({
      where: { tenantId, email, type: "ADMIN", expiresAt: { lt: new Date() } },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.magicLinkToken.create({
      data: { tenantId, token, email, type: "ADMIN", expiresAt },
    });

    // Send the verify link back to the SAME host the admin signed in from, so
    // the session cookie lands on the right domain (apex for tenant zero, the
    // tenant's own subdomain otherwise — host-scoped cookies don't cross hosts).
    const base = originFromRequest(request);
    const cbParam = callbackUrl && callbackUrl !== "/admin" ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
    const magicLink = `${base}/api/auth/admin/verify?token=${encodeURIComponent(token)}${cbParam}`;

    const branding = await getEmailBranding(tenantId);
    const subject = `Your ${branding.storeName} admin sign-in link`;
    const adminMlResult = await resend.emails.send({
      from: branding.from,
      to: [email],
      subject,
      html: adminMagicLinkEmail(magicLink, branding),
    });

    await logEmail({ tenantId, type: "MAGIC_LINK_ADMIN", toEmail: email, fromEmail: branding.fromAddress, subject, resendId: adminMlResult.data?.id, relatedType: "ADMIN" });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin magic link error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
