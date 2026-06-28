/**
 * tenant-domain-provisioner (TD1) — register a tenant subdomain in both
 * Cloudflare DNS and Vercel when a tenant is created.
 *
 * WHY one-at-a-time: a wildcard cert for `*.artisansstories.com` can't be
 * issued by Vercel while DNS lives on Cloudflare (Vercel needs the DNS-01 ACME
 * challenge, which the wildcard-on-Cloudflare path doesn't support). So instead
 * of one wildcard we register each subdomain individually:
 *
 *   1. Cloudflare — add a DNS-only CNAME `{slug}` → `cname.vercel-dns.com`.
 *   2. Vercel     — attach `{slug}.artisansstories.com` to the project so Vercel
 *                   provisions a per-domain certificate.
 *
 * Both steps are idempotent: a record/domain that already exists is treated as
 * success. Nothing here throws — domain provisioning is NON-FATAL to tenant
 * creation (an operator can retry). The caller decides what to do with the
 * `{ cloudflare, vercel }` result (we log it to PlatformAuditLog).
 */

const ROOT_DOMAIN = "artisansstories.com";

export interface ProvisionResult {
  cloudflare: boolean;
  vercel: boolean;
  error?: string;
}

/**
 * Provision DNS + Vercel domain for `{slug}.artisansstories.com`.
 * Never throws — returns flags describing what succeeded.
 */
export async function provisionTenantDomain(slug: string): Promise<ProvisionResult> {
  const result: ProvisionResult = { cloudflare: false, vercel: false };

  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const dnsToken = process.env.CLOUDFLARE_DNS_TOKEN;
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!zoneId || !dnsToken || !vercelToken || !projectId || !teamId) {
    result.error = "domain provisioning env vars are not configured";
    console.error(`[provisionTenantDomain] ${result.error} (slug=${slug})`);
    return result;
  }

  // ── 1. Cloudflare DNS — CNAME {slug} → cname.vercel-dns.com (DNS-only) ──────
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dnsToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "CNAME",
          name: slug, // relative to the zone → {slug}.artisansstories.com
          content: "cname.vercel-dns.com",
          proxied: false, // DNS-only: Vercel terminates SSL
          ttl: 1, // auto
        }),
      },
    );

    if (res.ok) {
      result.cloudflare = true;
    } else {
      const body = await res.json().catch(() => ({}));
      // 81057 / 81053 = "record already exists" → idempotent success.
      const alreadyExists =
        res.status === 409 ||
        (Array.isArray(body?.errors) &&
          body.errors.some((e: { code?: number }) => e?.code === 81057 || e?.code === 81053));
      if (alreadyExists) {
        result.cloudflare = true;
      } else {
        result.error = `cloudflare: HTTP ${res.status} ${JSON.stringify(body?.errors ?? body)}`;
        console.error(`[provisionTenantDomain] ${result.error} (slug=${slug})`);
      }
    }
  } catch (err) {
    result.error = `cloudflare: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[provisionTenantDomain] ${result.error} (slug=${slug})`);
  }

  // ── 2. Vercel — attach {slug}.artisansstories.com to the project ───────────
  try {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/domains?teamId=${teamId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: `${slug}.${ROOT_DOMAIN}` }),
      },
    );

    if (res.ok) {
      result.vercel = true;
    } else {
      const body = await res.json().catch(() => ({}));
      // Vercel returns 409 / domain_already_in_use when the domain is already
      // attached to this project → idempotent success.
      const code = body?.error?.code as string | undefined;
      const alreadyExists =
        res.status === 409 ||
        code === "domain_already_in_use" ||
        code === "domain_taken" ||
        code === "domain_already_exists";
      if (alreadyExists) {
        result.vercel = true;
      } else {
        result.error = `vercel: HTTP ${res.status} ${JSON.stringify(body?.error ?? body)}`;
        console.error(`[provisionTenantDomain] ${result.error} (slug=${slug})`);
      }
    }
  } catch (err) {
    result.error = `vercel: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[provisionTenantDomain] ${result.error} (slug=${slug})`);
  }

  return result;
}
