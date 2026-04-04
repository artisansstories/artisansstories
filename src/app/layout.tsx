import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Artisans' Stories — Handcrafted Goods from El Salvador",
  description: "Handcrafted goods from El Salvador's most talented artisans. Be the first to know when we launch.",
  openGraph: {
    title: "Artisans' Stories",
    description: "Handcrafted goods from El Salvador's most talented artisans.",
    url: "https://artisansstories.com",
    siteName: "Artisans' Stories",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
