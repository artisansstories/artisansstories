import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meet the Artisans — Artisans Stories",
  description: "The talented hands behind every piece. Meet the artisans from El Salvador whose craftsmanship brings each product to life.",
};

export default async function ArtisansPage() {
  const artisans = await prisma.artisan.findMany({
    where: { status: "ACTIVE" },
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      products: { where: { product: { status: "ACTIVE" } } },
    },
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 20px 80px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8B6914", marginBottom: 10 }}>
          The Makers
        </p>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 6vw, 60px)", fontWeight: 600, color: "#3a2e24", margin: "0 0 16px" }}>
          Meet the Artisans
        </h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, color: "#9a876e", maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
          Every product on Artisans Stories is made by hand by a skilled artisan. Their stories are woven into every piece.
        </p>
      </div>

      {artisans.length === 0 ? (
        <p style={{ textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 16, color: "#9a876e" }}>
          Artisan profiles coming soon.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 28 }}>
          {artisans.map((artisan) => {
            const heroImg = artisan.heroImageUrl ?? artisan.images[0]?.url ?? artisan.avatarUrl;
            const originParts = [artisan.city, artisan.originCountry].filter(Boolean);
            const productCount = artisan.products.length;
            return (
              <Link key={artisan.id} href={`/artisans/${artisan.slug}`} style={{ textDecoration: "none", display: "block" }}>
                <article style={{
                  background: "#fff",
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid #ede8df",
                  transition: "box-shadow 0.2s, transform 0.2s",
                }}>
                  {/* Card image */}
                  <div style={{ position: "relative", width: "100%", paddingBottom: "65%", background: "linear-gradient(135deg, #3a2e24, #8B6914)" }}>
                    {heroImg && (
                      <Image
                        src={heroImg}
                        alt={artisan.name}
                        fill
                        style={{ objectFit: "cover" }}
                        sizes="(max-width: 768px) 100vw, 350px"
                      />
                    )}
                    {artisan.avatarUrl && (
                      <div style={{
                        position: "absolute", bottom: -24, left: 20,
                        width: 64, height: 64, borderRadius: "50%",
                        overflow: "hidden", border: "3px solid #fff",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                      }}>
                        <Image src={artisan.avatarUrl} alt={artisan.name} fill style={{ objectFit: "cover" }} sizes="64px" />
                      </div>
                    )}
                  </div>
                  {/* Card body */}
                  <div style={{ padding: artisan.avatarUrl ? "36px 20px 20px" : "20px" }}>
                    <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: "#3a2e24", margin: "0 0 4px" }}>
                      {artisan.name}
                    </h2>
                    {artisan.tagline && (
                      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8B6914", fontStyle: "italic", margin: "0 0 10px" }}>
                        {artisan.tagline}
                      </p>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                      {originParts.length > 0 && (
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9a876e" }}>📍 {originParts.join(", ")}</span>
                      )}
                      {artisan.craft && (
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9a876e" }}>· {artisan.craft}</span>
                      )}
                    </div>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#c9b99a", margin: 0 }}>
                      {productCount} {productCount === 1 ? "product" : "products"} available
                    </p>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
