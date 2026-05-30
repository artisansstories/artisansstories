import { Client } from "pg";
import { notFound } from "next/navigation";
import Image from "next/image";
import TrackedLink from "@/components/TrackedLink";

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

async function getLinktreeData() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    
    const settingsResult = await client.query(`SELECT * FROM "LinkTreeSettings" WHERE id = 'singleton'`);
    const linksResult = await client.query(`SELECT * FROM "LinkTreeLink" WHERE "isEnabled" = true ORDER BY "sortOrder" ASC`);
    
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

// Click tracking removed - requires API endpoint for client-side tracking

export default async function LinktreePage() {
  const data = await getLinktreeData();
  
  // If disabled or no settings, show a simple message instead of 404
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#FFFBF0" }}>
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">Artisans Stories</h1>
          <p className="text-gray-600">Link hub coming soon</p>
        </div>
      </div>
    );
  }
  
  const { settings, links } = data;
  
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{
        backgroundColor: settings.backgroundColor,
        color: settings.textColor,
      }}
    >
      <div className="w-full max-w-md">
        {/* Logo + Link Hub Title */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <Image
              src="/logo-color.png"
              alt="Artisans Stories"
              width={200}
              height={54}
              className="mx-auto"
              unoptimized
            />
          </div>
          <h2 className="text-lg font-medium opacity-70 mb-6">Link Hub</h2>
        </div>

        {/* Profile (Optional - if profile image is set) */}
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

        {/* Bio (if set) */}
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
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm opacity-60">
          <p>© 2026 Artisans Stories</p>
        </div>
      </div>
    </div>
  );
}
