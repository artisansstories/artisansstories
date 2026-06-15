import type { Metadata } from "next";
import { Geist, Anonymous_Pro, Happy_Monkey, Oregano } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

const anonymousPro = Anonymous_Pro({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-anonymous-pro',
  display: 'swap',
});

const happyMonkey = Happy_Monkey({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-happy-monkey',
  display: 'swap',
});

const oregano = Oregano({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-oregano',
  display: 'swap',
});

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
    <html lang="en" className={`${anonymousPro.variable} ${happyMonkey.variable} ${oregano.variable}`}>
      <body className={geist.className}>{children}</body>
    </html>
  );
}
