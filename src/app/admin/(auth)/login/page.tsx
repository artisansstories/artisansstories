import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parseTenantHost } from "@/lib/tenant-context";
import LoginForm, { type LoginBrand } from "./LoginForm";

export const dynamic = "force-dynamic";

/**
 * Admin login (T4). Server-resolves the request host: on a tenant subdomain
 * (`{slug}.artisansstories.com`) it loads that tenant's name + logo + primary
 * color so the screen wears the store's brand and reads "Sign in to {Store}
 * Admin". On the apex it stays the house Artisans' Stories login (brand = null).
 *
 * We do NOT gate on the store's go-live flag here — a tenant admin must be able
 * to sign in before their storefront is public — so this is a direct tenant
 * lookup rather than getStorefrontTenant().
 */
async function resolveBrand(): Promise<LoginBrand | null> {
  const host = (await headers()).get("host");
  const routing = parseTenantHost(host);
  if (routing.kind !== "subdomain") return null;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: routing.slug },
    select: {
      name: true,
      theme: { select: { logoUrl: true, primaryColor: true } },
    },
  });
  if (!tenant) return null;

  return {
    tenantName: tenant.name,
    logoUrl: tenant.theme?.logoUrl ?? null,
    primaryColor: tenant.theme?.primaryColor ?? null,
  };
}

export default async function AdminLoginPage() {
  const brand = await resolveBrand();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; }
        body { font-family: 'Inter', sans-serif; }
        input { -webkit-appearance: none; appearance: none; }
        input:focus { outline: none; }
      `}</style>
      <main style={{
        minHeight: "100dvh",
        background: "linear-gradient(160deg, #fdf8f1 0%, #f5ede0 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "clamp(24px,5vw,48px) 20px",
      }}>
        <LoginForm brand={brand} />
      </main>
    </>
  );
}
