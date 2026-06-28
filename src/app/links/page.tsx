import { Client } from "pg";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Image from "next/image";
import TrackedLink from "@/components/TrackedLink";
import { DEFAULT_TENANT_ID } from "@/lib/tenant-context";
import { parseTenantHost } from "@/lib/tenant-host";

// Force dynamic rendering - links can change anytime
export const dynamic = 'force-dynamic';

interface Settings {
  isEnabled: boolean;
  profileName: string;
  profileBio?: string;
  profileImageUrl?: string;
  backgroundColor: string;
  buttonColor: string;
  textColor: string;
}

interface Link {
  id: string;
  title: string;
  url: string;
  description?: string;
  icon?: string;
  isEnabled: boolean;
  sortOrder: number;
}

interface TenantBranding {
  name: string;
  logoUrl: string | null;
}

async function getLinktreeData(tenantId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();

    const settingsResult = await client.query(
      `SELECT * FROM "LinkTreeSettings" WHERE "tenantId" = $1`,
      [tenantId]
    );
    const linksResult = await client.query(
      `SELECT * FROM "LinkTreeLink" WHERE "tenantId" = $1 AND "isEnabled" = true ORDER BY "sortOrder" ASC`,
      [tenantId]
    );

    const settings = settingsResult.rows[0] as Settings | undefined;
    const links = linksResult.rows as Link[];

    if (!settings || !settings.isEnabled) {
      return null;
    }

    return { settings, links };
  } catch (error) {
    console.error("Failed to fetch LinkTree data:", error);
    return null;
  } finally {
    await client.end();
  }
}

async function resolveTenant(host: string | null): Promise<{ tenantId: string; branding: TenantBranding }> {
  const routing = parseTenantHost(host);

  if (routing.kind === "root") {
    return {
      tenantId: DEFAULT_TENANT_ID,
      branding: { name: "Artisans Stories", logoUrl: null },
    };
  }

  // Subdomain — look up tenant by slug
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(
      `SELECT t.id, t.name, tt."logoUrl"
       FROM "Tenant" t
       LEFT JOIN "TenantTheme" tt ON tt."tenantId" = t.id
       WHERE t.slug = $1 LIMIT 1`,
      [routing.slug]
    );
    const row = result.rows[0];
    if (!row) {
      return {
        tenantId: DEFAULT_TENANT_ID,
        branding: { name: "Artisans Stories", logoUrl: null },
      };
    }
    return {
      tenantId: row.id as string,
      branding: { name: row.name as string, logoUrl: (row.logoUrl as string | null) ?? null },
    };
  } catch {
    return { tenantId: DEFAULT_TENANT_ID, branding: { name: "Artisans Stories", logoUrl: null } };
  } finally {
    await client.end();
  }
}

export default async function LinktreePage() {
  const headersList = await headers();
  const host = headersList.get("host");

  const { tenantId, branding } = await resolveTenant(host);
  const isHouse = tenantId === DEFAULT_TENANT_ID;

  const data = await getLinktreeData(tenantId);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#FFFBF0" }}>
        <div className="text-center">
          <LogoOrPlaceholder branding={branding} isHouse={isHouse} size="lg" />
          <p className="text-gray-600 mt-4">Link hub coming soon</p>
        </div>
      </div>
    );
  }

  const { settings, links } = data;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: settings.backgroundColor, color: settings.textColor }}
    >
      <div className="w-full max-w-md">
        {/* Logo + Link Hub Title */}
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <LogoOrPlaceholder branding={branding} isHouse={isHouse} size="md" />
          </div>
          <h2 className="text-lg font-medium opacity-70 mb-6">Link Hub</h2>
        </div>

        {/* Profile image (optional) */}
        {settings.profileImageUrl && (
          <div className="text-center mb-6">
            <Image
              src={settings.profileImageUrl}
              alt={settings.profileName}
              width={80}
              height={80}
              className="rounded-full mx-auto border-3 border-white shadow-md"
            />
          </div>
        )}

        {/* Bio */}
        {settings.profileBio && (
          <p className="text-center text-sm opacity-80 mb-8">{settings.profileBio}</p>
        )}

        {/* Links */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {links.map((link) => (
            <TrackedLink
              key={link.id}
              linkId={link.id}
              href={link.url}
              buttonColor={settings.buttonColor}
              icon={link.icon}
              title={link.title}
              description={link.description}
            />
          ))}
          {links.length === 0 && (
            <p className="text-center opacity-50 text-sm py-8">No links yet</p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm opacity-60">
          <p>© {new Date().getFullYear()} {branding.name}</p>
        </div>
      </div>
    </div>
  );
}

/** Renders the house logo, tenant logo, or a branded initial placeholder. */
function LogoOrPlaceholder({
  branding,
  isHouse,
  size,
}: {
  branding: TenantBranding;
  isHouse: boolean;
  size: "md" | "lg";
}) {
  if (isHouse) {
    return (
      <Image
        src="/logo-color.png"
        alt={branding.name}
        width={200}
        height={54}
        className="mx-auto"
        unoptimized
      />
    );
  }

  if (branding.logoUrl) {
    return (
      <Image
        src={branding.logoUrl}
        alt={branding.name}
        width={200}
        height={54}
        style={{ objectFit: "contain", maxHeight: size === "lg" ? 64 : 48 }}
        className="mx-auto"
        unoptimized
      />
    );
  }

  // Generic placeholder — initial + store name
  const initials = branding.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const boxSize = size === "lg" ? 64 : 48;
  const fontSize = size === "lg" ? 24 : 18;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
      <div
        style={{
          width: boxSize,
          height: boxSize,
          borderRadius: 12,
          background: "linear-gradient(135deg, #8B6914, #C9A84C)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 700,
          fontSize,
          fontFamily: "'Inter', sans-serif",
          flexShrink: 0,
        }}
      >
        {initials}
      </div>
      <span
        style={{
          fontWeight: 700,
          fontSize: size === "lg" ? 22 : 17,
          color: "#3a2e24",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {branding.name}
      </span>
    </div>
  );
}
