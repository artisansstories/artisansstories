/**
 * brand-fonts.ts — next/font loaders for the storefront font allowlist (P5)
 *
 * The root layout already loads Geist (body default) plus Anonymous Pro, Happy
 * Monkey and Oregano as CSS variables on <html>. The remaining allowlist fonts
 * (Inter, Cormorant Garamond, Poppins, Playfair Display) are loaded here and
 * applied to the storefront subtree via `BRAND_FONT_VARS`.
 *
 * `fontStack(name)` maps an allowlist font name to a CSS font-family value that
 * references the corresponding next/font variable, with sensible web-safe
 * fallbacks. The storefront layout uses it to build `--brand-font-heading` /
 * `--brand-font-body` for whatever fonts the tenant picked.
 */
import { Inter, Cormorant_Garamond, Poppins, Playfair_Display } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const cormorant = Cormorant_Garamond({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});

const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

/** Class string applying the four storefront-loaded font variables. The other
 *  three allowlist fonts come from variables already set on <html> at root. */
export const BRAND_FONT_VARS = `${inter.variable} ${cormorant.variable} ${poppins.variable} ${playfair.variable}`;

/** Allowlist font name → CSS font-family stack referencing the loaded variable. */
export function fontStack(name: string): string {
  switch (name) {
    case "Cormorant Garamond":
      return "var(--font-cormorant), 'Cormorant Garamond', Georgia, 'Times New Roman', serif";
    case "Anonymous Pro":
      return "var(--font-anonymous-pro), 'Anonymous Pro', ui-monospace, monospace";
    case "Happy Monkey":
      return "var(--font-happy-monkey), 'Happy Monkey', 'Comic Sans MS', system-ui, cursive";
    case "Oregano":
      return "var(--font-oregano), 'Oregano', 'Brush Script MT', cursive";
    case "Poppins":
      return "var(--font-poppins), 'Poppins', system-ui, -apple-system, sans-serif";
    case "Playfair Display":
      return "var(--font-playfair), 'Playfair Display', Georgia, serif";
    case "Inter":
    default:
      return "var(--font-inter), 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
  }
}
