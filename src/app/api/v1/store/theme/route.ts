import { NextRequest } from "next/server";
import { withApiKey, corsPreflight, jsonOk, SCOPE_STORE_READ } from "@/lib/api-v1";

/**
 * GET /api/v1/store/theme
 * Branding payload for first-class embedding in a tenant's frontend.
 */
export async function GET(req: NextRequest) {
  return withApiKey(req, SCOPE_STORE_READ, async ({ tenantId, db }) => {
    const [theme, settings, tenant] = await Promise.all([
      db.tenantTheme.findUnique({ where: { tenantId } }),
      db.storeSettings.findFirst(),
      // Tenant is a global model (not auto-scoped); look it up by id directly.
      db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, name: true } }),
    ]);

    return jsonOk({
      tenant: {
        slug: tenant?.slug ?? tenantId,
        name: tenant?.name ?? settings?.storeName ?? "Store",
      },
      theme: {
        logoUrl: theme?.logoUrl ?? settings?.storeLogo ?? null,
        faviconUrl: theme?.faviconUrl ?? settings?.storeFavicon ?? null,
        primaryColor: theme?.primaryColor ?? settings?.primaryColor ?? "#1f6feb",
        secondaryColor: theme?.secondaryColor ?? "#0b3d91",
        accentColor: theme?.accentColor ?? settings?.accentColor ?? "#ff7a18",
        fontHeading: theme?.fontHeading ?? settings?.fontHeading ?? "Inter",
        fontBody: theme?.fontBody ?? settings?.fontBody ?? "Inter",
        radius: theme?.radius ?? "md",
      },
      storeName: settings?.storeName ?? tenant?.name ?? "Store",
      storeDescription: settings?.storeDescription ?? null,
    });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
