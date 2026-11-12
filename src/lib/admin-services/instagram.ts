/**
 * admin-services/instagram.ts — read-only Instagram connection status for MCP.
 *
 * The OAuth connect/callback/disconnect routes are browser flows and are not
 * extracted. This only reports, per artisan, whether a token is stored and when
 * it expires. The access token itself is selected solely to compute a boolean
 * and is NEVER returned.
 */
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok } from "./result";

export async function instagramStatus(db: TenantPrisma) {
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
      };
    }),
  });
}
