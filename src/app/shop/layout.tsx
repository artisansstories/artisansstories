"use client";

import React from "react";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { CartDrawerProvider } from "@/components/CartDrawerProvider";
import CartDrawer from "@/components/CartDrawer";
import ShopNav from "@/components/ShopNav";
import ShopFooter from "@/components/ShopFooter";

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

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartDrawerProvider>
      <div
        className={`${cormorant.variable} ${inter.variable}`}
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          background: "#faf7f2",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <style>{`
          *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
          html { height: 100%; }
          body { height: 100%; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #d8cfc0; border-radius: 6px; }
        `}</style>

        <ShopNav />

        <main style={{ flex: 1 }}>
          {children}
        </main>

        <ShopFooter />
        <CartDrawer />
      </div>
    </CartDrawerProvider>
  );
}
