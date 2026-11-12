/**
 * admin-invite.ts — email a new team member an admin sign-in link for THEIR store.
 *
 * Used by addTeamMember (admin Team page and the team_add MCP tool). It used to
 * POST to `${NEXT_PUBLIC_SITE_URL}/api/auth/admin/magic-link`, i.e. the house
 * host, so for any other store the magic-link route resolved the house tenant,
 * found no such admin, sent nothing, and the caller still reported success.
 *
 * Now the token is minted for the member's own tenant, the link points at that
 * tenant's host (apex for the house store, `{slug}.artisansstories.com`
 * otherwise, the same host rule as the platform invite), the email uses the
 * store's branding, and the outcome is reported truthfully.
 */
import crypto from "crypto";
import { Resend } from "resend";
import { prisma } from "./prisma";
import { DEFAULT_TENANT_ID } from "./tenant-context";
import { tenantBaseUrl, ROOT_DOMAIN } from "./tenant-host";
import { getEmailBranding, emailLogoHtml, type EmailBranding } from "./email-branding";
import { logEmail } from "./email-log";
import { escapeHtml } from "./escape-html";

const resend = new Resend(process.env.RESEND_API_KEY);

/** Invite links last longer than a login link: the person may not see it for a while. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AdminInviteInput {
  tenantId: string;
  adminId: string;
  email: string;
  role: string;
  inviterName?: string;
}

export type AdminInviteResult =
  | { sent: true; to: string; signInHost: string }
  | { sent: false; to: string; error: string };

/** Base URL whose host resolves to `tenantId` in the magic-link verify route. */
export async function adminBaseUrlForTenant(tenantId: string): Promise<string | null> {
  if (tenantId === DEFAULT_TENANT_ID) return process.env.NEXT_PUBLIC_SITE_URL ?? `https://${ROOT_DOMAIN}`;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return tenant ? tenantBaseUrl(tenant.slug) : null;
}

function inviteHtml(link: string, branding: EmailBranding, inviterName: string | undefined, role: string): string {
  const store = escapeHtml(branding.storeName);
  const who = inviterName ? `${escapeHtml(inviterName)} has` : "You have been";
  const lead = inviterName ? `${who} added you` : `${who} added`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>You're invited to ${store} admin</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;"><tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
      <tr><td style="padding:28px 32px;text-align:center;border-bottom:1px solid #ede8df;">${emailLogoHtml(branding)}</td></tr>
      <tr><td style="padding:40px 40px 32px;text-align:center;">
        <h2 style="margin:0 0 12px;font-size:22px;color:#3a2e24;font-weight:600;">You're invited to the ${store} admin</h2>
        <p style="margin:0 0 28px;font-size:15px;color:#7a6852;line-height:1.6;">${lead} to the ${store} team as <strong>${escapeHtml(role)}</strong>. Click below to sign in. This link expires in 7 days and can only be used once.</p>
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;"><tr>
          <td style="background:${escapeHtml(branding.accentColor)};border-radius:10px;">
            <a href="${escapeHtml(link)}" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.04em;font-family:'Helvetica Neue',Arial,sans-serif;">Sign In to Admin</a>
          </td>
        </tr></table>
        <div style="padding:16px 20px;background:#faf7f2;border-radius:8px;border:1px solid #ede8df;">
          <p style="margin:0;font-size:13px;color:#9a876e;line-height:1.5;">If you weren't expecting this, you can safely ignore this email.</p>
        </div>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#3a2e24;text-align:center;"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">&copy; ${new Date().getFullYear()} ${store}</p></td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

/** Mint a 7-day admin magic link for the member's tenant and email it. Never throws. */
export async function sendAdminInvite(input: AdminInviteInput): Promise<AdminInviteResult> {
  const { tenantId, adminId, email, role, inviterName } = input;
  try {
    const base = await adminBaseUrlForTenant(tenantId);
    if (!base) return { sent: false, to: email, error: "Store not found, so no sign-in link could be built" };

    const token = crypto.randomBytes(32).toString("hex");
    // MagicLinkToken is keyed by its global secret token (not auto-scoped); the
    // tenant is stamped explicitly so verify signs the member into this store.
    await prisma.magicLinkToken.create({
      data: { tenantId, token, email, type: "ADMIN", expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    const link = `${base}/api/auth/admin/verify?token=${encodeURIComponent(token)}`;

    const branding = await getEmailBranding(tenantId);
    const subject = `You're invited to the ${branding.storeName} admin`;
    const result = await resend.emails.send({
      from: branding.from,
      to: [email],
      ...(branding.replyTo ? { replyTo: branding.replyTo } : {}),
      subject,
      html: inviteHtml(link, branding, inviterName, role),
    });
    if (result.error) {
      return { sent: false, to: email, error: `Email provider rejected the invite: ${result.error.message}` };
    }
    await logEmail({
      tenantId,
      type: "MAGIC_LINK_ADMIN",
      toEmail: email,
      fromEmail: branding.fromAddress,
      subject,
      resendId: result.data?.id,
      relatedId: adminId,
      relatedType: "ADMIN",
    });
    return { sent: true, to: email, signInHost: new URL(base).host };
  } catch (err) {
    console.error("[admin-invite] failed:", err);
    return { sent: false, to: email, error: err instanceof Error ? err.message : String(err) };
  }
}
