import { Client } from "pg";
import LandingPage from "./LandingPage";

// Force dynamic - settings can change
export const dynamic = 'force-dynamic';

interface SocialLink {
  platform: "facebook" | "instagram" | "x" | "tiktok" | "pinterest" | "email";
  url?: string;
  value?: string;
}

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
  midSectionContent?: string;
  showComingSoonBadge: boolean;
  comingSoonText: string;
  showLogo: boolean;
  showHeroImage: boolean;
  showAboutSection: boolean;
  showMidSection: boolean;
  showEmailForm: boolean;
  showSocialIcons: boolean;
  socialLinks: SocialLink[];
  emailButtonText: string;
  emailButtonColor: string;
  emailSubText: string;
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
      showComingSoonBadge: true,
      comingSoonText: "Coming Soon",
      showLogo: true,
      showHeroImage: true,
      showAboutSection: true,
      showMidSection: true,
      showEmailForm: true,
      showSocialIcons: true,
      socialLinks: [],
      emailButtonText: "Notify Me When We Launch",
      emailButtonColor: "#8B6914",
      emailSubText: "No spam, ever · Just our launch announcement",
    };
  } finally {
    await client.end();
  }
}

export default async function LandingPageWrapper() {
  const settings = await getSettings();
  return <LandingPage settings={settings} />;
}
