/**
 * admin-services/instagram.ts — read-only Instagram connection status for MCP.
 *
 * The OAuth connect/callback/disconnect routes are browser flows and are not
 * extracted. This only reports, per artisan, whether a token is stored and when
 * it expires, plus the admin page to open to (re)connect: OAuth needs a person
 * in a browser, so the MCP can only point there. The access token itself is
 * selected solely to compute a boolean and is NEVER returned.
 * Shared by GET /api/admin/instagram/status (the artisan edit page) and the
 * instagram_status MCP tool.
 */
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { adminBaseUrlForTenant } from "@/lib/admin-invite";
import { ok } from "./result";

export async function instagramStatus(db: TenantPrisma) {
  const base = (await adminBaseUrlForTenant(db.$tenantId)) ?? "";
  const artisans = await db.artisan.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, status: true, igUserId: true, igTokenExpiry: true, igAccessToken: true },
  });
  const now = Date.now();
  return ok({
    artisans: artisans.map((a) => {
      const expiresAt = a.igTokenExpiry;
      const expired = !!expiresAt && expiresAt.getTime() <= now;
      return {
        id: a.id,
        name: a.name,
        slug: a.slug,
        status: a.status,
        connected: !!a.igAccessToken && !expired,
        hasToken: !!a.igAccessToken,
        igUserId: a.igUserId,
        tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
        tokenExpired: expired,
        daysUntilExpiry: expiresAt ? Math.floor((expiresAt.getTime() - now) / 86_400_000) : null,
        ...(!a.igAccessToken || expired
          ? {
              connectAdminUrl: `${base}/admin/artisans/${a.id}/edit#instagram`,
              nextStep: `${expired ? "The Instagram token expired. " : ""}Open ${base}/admin/artisans/${a.id}/edit#instagram and click "Connect Instagram" (it needs someone signed in to Instagram in a browser).`,
            }
          : {}),
      };
    }),
  });
}
