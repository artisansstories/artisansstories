import React from "react";
import Image from "next/image";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { headers } from "next/headers";
import { parseTenantHost } from "@/lib/tenant-host";
import { prisma } from "@/lib/prisma";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Secure Checkout",
};

async function resolveTenantBranding(): Promise<{ logoUrl: string | null; storeName: string }> {
  try {
    const host = (await headers()).get("host");
    const routing = parseTenantHost(host);
    if (routing.kind === "root") return { logoUrl: null, storeName: "Artisans\' Stories" };
    const tenant = await prisma.tenant.findUnique({
      where: { slug: routing.slug },
      select: { name: true, theme: { select: { logoUrl: true } } },
    });
    return {
      logoUrl: tenant?.theme?.logoUrl ?? null,
      storeName: tenant?.name ?? "Store",
    };
  } catch {
    return { logoUrl: null, storeName: "Artisans\' Stories" };
  }
}

export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const { logoUrl, storeName } = await resolveTenantBranding();
  return (
    <div
      className={`${cormorant.variable} ${inter.variable}`}
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#faf7f2",
        fontFamily: "var(--font-inter), 'Inter', sans-serif",
      }}
    >
      <style>{`
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html { height: 100%; }
        body { height: 100%; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d8cfc0; border-radius: 6px; }
        input, select, textarea {
          font-family: var(--font-inter), 'Inter', sans-serif;
          font-size: 15px;
        }
      `}</style>

      {/* Checkout Header */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #ede8df",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={storeName}
                width={160}
                height={43}
                style={{ width: 140, height: "auto" }}
                priority
                unoptimized
              />
            ) : (
              <Image
                src="/logo-color.png"
                alt="Artisans\' Stories"
                width={160}
                height={43}
                style={{ width: 140, height: "auto" }}
                priority
                unoptimized
              />
            )}
          </a>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#7a6852",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Secure Checkout
          </div>
        </div>
      </header>

      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
