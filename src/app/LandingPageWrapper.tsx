import { Client } from "pg";
import LandingPage from "./LandingPage";

// Force dynamic - settings can change
export const dynamic = 'force-dynamic';

interface Settings {
  heroTitle: string;
  heroSubtitle?: string;
  heroCTA: string;
  heroImageUrl?: string;
  backgroundImageUrl?: string;
  aboutTitle: string;
  aboutContent?: string;
  aboutImageUrl?: string;
  footerText: string;
}

async function getSettings(): Promise<Settings> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`SELECT * FROM "LandingPageSettings" WHERE id = 'singleton'`);
    return result.rows[0] as Settings;
  } catch (error) {
    console.error("Failed to fetch landing page settings:", error);
    // Return defaults
    return {
      heroTitle: "Handcrafted treasures from El Salvador",
      heroSubtitle: "Every piece tells a story",
      heroCTA: "Join the Waitlist",
      aboutTitle: "Our Story",
      footerText: "© 2026 Artisans Stories",
    };
  } finally {
    await client.end();
  }
}

export default async function LandingPageWrapper() {
  const settings = await getSettings();
  return <LandingPage settings={settings} />;
}
