/**
 * tenant-host.ts — Pure host parsing for subdomain tenant routing (T1/T2).
 *
 * Dependency-free on purpose: this is imported by BOTH the request-time tenant
 * resolver (`tenant-context.ts`, which adds the DB lookup + cache) AND the proxy
 * (`proxy.ts`), so it must not drag Prisma or any server-only module into the
 * proxy bundle. Everything here is a pure function over the `host` header / env.
 */

/**
 * The platform's apex domain. Tenant zero lives here (artisansstories.com /
 * www.artisansstories.com); every other tenant is a `{slug}.artisansstories.com`
 * subdomain. One source of truth for host parsing + subdomain-URL building. No
 * env var — this is a fixed platform fact (per spec).
 */
export const ROOT_DOMAIN = "artisansstories.com";

/** Minimal request shape we need — anything with a `headers.get(name)`. */
export type HeaderCarrier = { headers: { get(name: string): string | null } };

/**
 * The routing decision for an incoming host. `rootHost` is the apex authority
 * (incl. dev port) the request should fall back to — used by the proxy to
 * redirect platform-only paths off a subdomain.
 */
export type HostRouting =
  | { kind: "root"; rootHost: string }
  | { kind: "subdomain"; slug: string; rootHost: string };

/**
 * Pure parse of an HTTP `host` header into a tenant routing decision. No DB, no
 * I/O — safe to call from the proxy (edge/Node) and from request handlers alike.
 *
 *   artisansstories.com / www.artisansstories.com  → { kind: "root" }
 *   {slug}.artisansstories.com                     → { kind: "subdomain", slug }
 *   localhost[:port] / 127.0.0.1                    → { kind: "root" }   (dev)
 *   {slug}.localhost[:port]                         → { kind: "subdomain", slug }
 *   anything else (preview hosts, raw IP, …)        → { kind: "root" }
 */
export function parseTenantHost(host: string | null | undefined): HostRouting {
  if (!host) return { kind: "root", rootHost: ROOT_DOMAIN };

  // Normalize: lowercase, drop any port for matching but keep it for rootHost.
  const lower = host.trim().toLowerCase();
  const [hostname, port] = lower.split(":");
  const portSuffix = port ? `:${port}` : "";

  // Localhost dev. `{slug}.localhost` → subdomain; bare localhost / loopback → root.
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return { kind: "root", rootHost: `localhost${portSuffix}` };
  }
  if (hostname.endsWith(".localhost")) {
    const slug = hostname.slice(0, -".localhost".length);
    if (slug && slug !== "www") {
      return { kind: "subdomain", slug, rootHost: `localhost${portSuffix}` };
    }
    return { kind: "root", rootHost: `localhost${portSuffix}` };
  }

  // Production apex + www → tenant zero.
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) {
    return { kind: "root", rootHost: `${ROOT_DOMAIN}${portSuffix}` };
  }

  // `{slug}.artisansstories.com` → subdomain. Reject multi-level / empty slugs.
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const slug = hostname.slice(0, -`.${ROOT_DOMAIN}`.length);
    if (slug && slug !== "www" && !slug.includes(".")) {
      return { kind: "subdomain", slug, rootHost: `${ROOT_DOMAIN}${portSuffix}` };
    }
  }

  // Unknown host (Vercel preview, bare IP, custom domain we don't handle yet) —
  // fail safe to tenant zero rather than 404 the whole app.
  return { kind: "root", rootHost: ROOT_DOMAIN };
}

/**
 * Build the externally-reachable base URL for a tenant's own subdomain, derived
 * from NEXT_PUBLIC_SITE_URL so it follows the deploy environment:
 *   prod  https://artisansstories.com   → https://{slug}.artisansstories.com
 *   dev   http://localhost:3000         → http://{slug}.localhost:3000
 * Used to mint admin magic links that resolve to the correct tenant on click.
 */
export function tenantBaseUrl(slug: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${ROOT_DOMAIN}`;
  try {
    const url = new URL(site);
    // Strip a leading www. so we prefix the bare apex, then prepend the slug.
    const apex = url.hostname.replace(/^www\./, "");
    url.hostname = `${slug}.${apex}`;
    // URL.origin reflects protocol + host (+ port).
    return url.origin;
  } catch {
    return `https://${slug}.${ROOT_DOMAIN}`;
  }
}

/**
 * Reconstruct the public origin (protocol + host) the request arrived on, so
 * redirects and emailed links stay on the SAME domain the user is using — the
 * apex for tenant zero, a `{slug}.artisansstories.com` subdomain otherwise. This
 * keeps the host-scoped admin session cookie valid end-to-end (magic link →
 * verify → /admin all on one host). Falls back to NEXT_PUBLIC_SITE_URL.
 */
export function originFromRequest(req?: HeaderCarrier): string {
  const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${ROOT_DOMAIN}`;
  const host = req?.headers.get("host");
  if (!host) return fallback;
  const proto =
    req?.headers.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}
