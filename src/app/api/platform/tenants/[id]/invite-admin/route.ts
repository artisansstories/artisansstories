import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import { tenantBaseUrl } from "@/lib/tenant-context";
import { getEmailBranding } from "@/lib/email-branding";
import { logEmail } from "@/lib/email-log";
import { Resend } from "resend";
import crypto from "crypto";

/**
 * POST /api/platform/tenants/[id]/invite-admin — invite a store admin (T3)
 *
 * Operator-only (requirePlatformOperator). Upserts an AdminUser for the target
 * tenant (creating it, or reactivating + refreshing an existing row), then emails
 * a magic sign-in link that points at the TENANT'S OWN SUBDOMAIN
 * (`https://{slug}.artisansstories.com/api/auth/admin/verify?token=…`) so clicking
 * it resolves to — and signs the admin into — the correct store.
 *
 * Rate limited to 5 invites per tenant per hour (counted from the invite audit
 * trail). Body: { email, name, role? }. Returns the upserted admin summary.
 */

const resend = new Resend(process.env.RESEND_API_KEY);

/** Invites accept the schema roles; the spec's "OWNER" is an alias for the
 *  highest store role (SUPER_ADMIN). Anything else falls back to EDITOR. */
const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "EDITOR"] as const;
type AdminRoleValue = (typeof ADMIN_ROLES)[number];

function normalizeRole(input: unknown): AdminRoleValue {
  if (typeof input !== "string") return "EDITOR";
  const upper = input.toUpperCase();
  if (upper === "OWNER") return "SUPER_ADMIN";
  return (ADMIN_ROLES as readonly string[]).includes(upper)
    ? (upper as AdminRoleValue)
    : "EDITOR";
}

/** Tenant-branded admin invite email. Mirrors the house admin magic-link style
 *  but names the store and routes to its subdomain verify link. */
function inviteEmailHtml(tenantName: string, magicLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to ${tenantName} admin</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8;padding:32px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="padding:40px 40px 8px;text-align:center;">
            <h2 style="margin:0 0 12px;font-size:22px;color:#3a2e24;font-weight:600;">You've been added to ${tenantName}</h2>
            <p style="margin:0 0 28px;font-size:15px;color:#7a6852;line-height:1.6;">An operator has given you admin access to the <strong>${tenantName}</strong> store. Click below to sign in. This link expires in 7 days and can only be used once.</p>
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;">
              <tr>
                <td style="background:linear-gradient(135deg,#8B6914 0%,#C9A84C 100%);border-radius:10px;">
                  <a href="${magicLink}" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.04em;font-family:'Helvetica Neue',Arial,sans-serif;">Sign In to ${tenantName} Admin</a>
                </td>
              </tr>
            </table>
            <div style="padding:16px 20px;background:#faf7f2;border-radius:8px;border:1px solid #ede8df;">
              <p style="margin:0;font-size:13px;color:#9a876e;line-height:1.5;">If you weren't expecting this, you can safely ignore this email.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;background:#3a2e24;text-align:center;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">Powered by Orange Slice Stores</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

interface InviteBody {
  email?: unknown;
  name?: unknown;
  role?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let operator;
  try {
    operator = await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const { id: tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  let body: InviteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = normalizeRole(body.role);

  const errors: string[] = [];
  if (!email || !email.includes("@")) errors.push("`email` must be a valid email address.");
  if (!name) errors.push("`name` must be a non-empty string.");
  if (errors.length) {
    return NextResponse.json({ error: "validation_failed", errors }, { status: 400 });
  }

  // Rate limit: max 5 invites per tenant per hour, counted from the invite audit
  // trail (each successful invite writes a `tenant.invite_admin` row below).
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentInvites = await prisma.platformAuditLog.count({
    where: { tenantId, action: "tenant.invite_admin", createdAt: { gte: oneHourAgo } },
  });
  if (recentInvites >= 5) {
    return NextResponse.json(
      { error: "rate_limited", message: "Invite limit reached for this store (5/hour). Try again later." },
      { status: 429 },
    );
  }

  // Upsert the admin: create if new, else reactivate + refresh name/role. The
  // unique key is [tenantId, email].
  const adminUser = await prisma.adminUser.upsert({
    where: { tenantId_email: { tenantId, email } },
    create: { tenantId, email, name, role, isActive: true },
    update: { name, role, isActive: true },
    select: { id: true, email: true, name: true, role: true },
  });

  // Mint a magic-link token tied to this tenant. Longer expiry than a login link
  // (7 days) since this is a one-time onboarding invite, not a re-auth.
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.magicLinkToken.create({
    data: { tenantId, token, email, type: "ADMIN", expiresAt },
  });

  // The link MUST land on the tenant's own subdomain so verify resolves to the
  // right store and sets the host-scoped session there.
  const magicLink = `${tenantBaseUrl(tenant.slug)}/api/auth/admin/verify?token=${encodeURIComponent(token)}`;

  const branding = await getEmailBranding(tenantId);
  const subject = `You've been invited to ${tenant.name} admin`;
  const sendResult = await resend.emails.send({
    from: branding.from,
    to: [email],
    subject,
    html: inviteEmailHtml(tenant.name, magicLink),
  });

  await logEmail({
    tenantId,
    type: "MAGIC_LINK_ADMIN",
    toEmail: email,
    fromEmail: branding.fromAddress,
    subject,
    resendId: sendResult.data?.id,
    relatedType: "ADMIN",
    relatedId: adminUser.id,
  });

  // Audit the invite (also feeds the rate-limit count above).
  await prisma.platformAuditLog.create({
    data: {
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "tenant.invite_admin",
      tenantId,
      detail: `invited ${email} (${role}) to "${tenant.name}"`,
    },
  });

  return NextResponse.json({ success: true, adminUser });
}
