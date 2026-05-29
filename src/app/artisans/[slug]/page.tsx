import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Image from "next/image";
import ProductCard from "@/components/ProductCard";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const artisan = await prisma.artisan.findUnique({ where: { slug } });
  if (!artisan) return {};
  return {
    title: artisan.metaTitle ?? `${artisan.name} — Artisan at Artisans Stories`,
    description: artisan.metaDescription ?? artisan.tagline ?? `Handcrafted goods by ${artisan.name} from ${artisan.originCountry}.`,
    openGraph: {
      title: artisan.name,
      description: artisan.tagline ?? undefined,
      images: artisan.heroImageUrl ? [artisan.heroImageUrl] : artisan.avatarUrl ? [artisan.avatarUrl] : [],
    },
  };
}

export default async function ArtisanProfilePage({ params }: PageProps) {
  const { slug } = await params;

  const artisan = await prisma.artisan.findUnique({
    where: { slug, status: "ACTIVE" },
    include: {
      images: { orderBy: { position: "asc" } },
      products: {
        include: {
          product: {
            include: {
              images: { orderBy: { position: "asc" }, take: 1 },
              variants: { orderBy: { position: "asc" }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!artisan) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = artisan as any;
  const socialLinks = artisan.socialLinks as Record<string, string> | null;
  const activeProducts = a.products
    .map((pa: { product: { status: string; id: string; slug: string; name: string; price: number; compareAtPrice: number | null; isFeatured: boolean; images: { url: string; urlMedium: string | null; altText: string | null }[]; variants: { id: string }[] } }) => pa.product)
    .filter((p: { status: string }) => p && p.status === "ACTIVE") as { id: string; slug: string; name: string; price: number; compareAtPrice: number | null; isFeatured: boolean; images: { url: string; urlMedium: string | null; altText: string | null }[]; variants: { id: string }[] }[];

  const originParts = [artisan.city, artisan.region, artisan.originCountry].filter(Boolean);
  const originStr = originParts.join(", ");
  const yearsLabel = artisan.practicingSince
    ? `Crafting since ${artisan.practicingSince}`
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: artisan.name,
    jobTitle: artisan.craft ?? "Artisan",
    description: artisan.tagline,
    address: {
      "@type": "PostalAddress",
      addressLocality: artisan.city,
      addressRegion: artisan.region,
      addressCountry: artisan.originCountry,
    },
    sameAs: socialLinks
      ? Object.values(socialLinks).filter(Boolean)
      : [],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div style={{ background: "#faf7f2", minHeight: "100vh" }}>

        {/* Hero */}
        <div style={{
          position: "relative",
          width: "100%",
          minHeight: "60vh",
          background: artisan.heroImageUrl ? "#1a1208" : "linear-gradient(135deg, #3a2e24 0%, #8B6914 100%)",
          display: "flex",
          alignItems: "flex-end",
          overflow: "hidden",
        }}>
          {artisan.heroImageUrl && (
            <Image
              src={artisan.heroImageUrl}
              alt={`${artisan.name} hero`}
              fill
              style={{ objectFit: "cover", opacity: 0.55 }}
              priority
              sizes="100vw"
            />
          )}
          <div style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            padding: "48px 24px 56px",
            background: "linear-gradient(to top, rgba(10,6,2,0.85) 0%, transparent 100%)",
            textAlign: "center",
          }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", color: "rgba(255,255,255,0.65)", textTransform: "uppercase", margin: "0 0 10px" }}>
              Artisans Stories
            </p>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 7vw, 72px)", fontWeight: 600, color: "#fff", margin: "0 0 10px", lineHeight: 1.1 }}>
              {artisan.name}
            </h1>
            {artisan.tagline && (
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(18px, 3vw, 26px)", color: "rgba(255,255,255,0.8)", fontStyle: "italic", margin: 0 }}>
                {artisan.tagline}
              </p>
            )}
          </div>
        </div>

        {/* Profile header */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px" }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            marginTop: -48,
            marginBottom: 48,
          }}>
            {artisan.avatarUrl && (
              <div style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                overflow: "hidden",
                border: "4px solid #faf7f2",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                position: "relative",
                marginBottom: 16,
                flexShrink: 0,
              }}>
                <Image src={artisan.avatarUrl} alt={artisan.name} fill style={{ objectFit: "cover" }} sizes="120px" />
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: artisan.avatarUrl ? 0 : 32 }}>
              {originStr && (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5a4a38", background: "#fff", border: "1px solid #ede8df", borderRadius: 20, padding: "4px 12px" }}>
                  📍 {originStr}
                </span>
              )}
              {artisan.craft && (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8B6914", background: "rgba(139,105,20,0.08)", border: "1px solid rgba(139,105,20,0.2)", borderRadius: 20, padding: "4px 12px" }}>
                  {artisan.craft}
                </span>
              )}
              {yearsLabel && (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5a4a38", background: "#fff", border: "1px solid #ede8df", borderRadius: 20, padding: "4px 12px" }}>
                  ✦ {yearsLabel}
                </span>
              )}
            </div>
          </div>

          {/* Pull quote */}
          {artisan.quote && (
            <div style={{
              margin: "0 0 56px",
              padding: "28px 32px",
              borderLeft: "4px solid #8B6914",
              background: "#fff",
              borderRadius: "0 12px 12px 0",
            }}>
              <p style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "clamp(22px, 3.5vw, 32px)",
                fontStyle: "italic",
                color: "#3a2e24",
                margin: 0,
                lineHeight: 1.4,
              }}>
                &ldquo;{artisan.quote}&rdquo;
              </p>
            </div>
          )}

          {/* Story */}
          {artisan.story && (
            <section style={{ marginBottom: 64 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 600, color: "#3a2e24", marginBottom: 20 }}>
                Their Story
              </h2>
              <div
                className="rte-content"
                style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, color: "#5a4a38", lineHeight: 1.8 }}
                dangerouslySetInnerHTML={{ __html: artisan.story }}
              />
            </section>
          )}
        </div>

        {/* Gallery */}
        {a.images.length > 0 && (
          <section style={{ maxWidth: 1200, margin: "0 auto 64px", padding: "0 20px" }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 600, color: "#3a2e24", marginBottom: 24 }}>
              Gallery
            </h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}>
              {a.images.map((img: { id: string; urlMedium: string | null; url: string; altText: string | null; caption: string | null }) => (
                <div key={img.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#f5f0e8" }}>
                  <Image
                    src={img.urlMedium ?? img.url}
                    alt={img.altText ?? artisan.name}
                    fill
                    style={{ objectFit: "cover" }}
                    sizes="(max-width: 768px) 50vw, 300px"
                  />
                  {img.caption && (
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
                      padding: "20px 12px 10px",
                    }}>
                      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#fff", margin: 0 }}>{img.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Their Work */}
        {activeProducts.length > 0 && (
          <section style={{ maxWidth: 1200, margin: "0 auto 64px", padding: "0 20px" }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 600, color: "#3a2e24", marginBottom: 24 }}>
              Handcrafted by {artisan.name}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
              {activeProducts.map((product: { id: string; slug: string; name: string; price: number; compareAtPrice: number | null; isFeatured: boolean; images: { url: string; urlMedium: string | null; altText: string | null }[]; variants: { id: string }[] }) => (
                <ProductCard
                  key={product.id}
                  product={{
                    id: product.id,
                    slug: product.slug,
                    name: product.name,
                    price: product.price,
                    compareAtPrice: product.compareAtPrice ?? null,
                    isFeatured: product.isFeatured,
                    hasVariants: product.variants.length > 1,
                    variantId: product.variants[0]?.id ?? null,
                    images: product.images.map((i: { url: string; urlMedium: string | null; altText: string | null }) => ({ url: i.url, urlMedium: i.urlMedium ?? null, altText: i.altText ?? null })),
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Letter to buyer */}
        {artisan.letterToBuyer && (
          <div style={{ maxWidth: 700, margin: "0 auto 64px", padding: "0 20px" }}>
            <div style={{
              background: "#fff",
              border: "1px solid #ede8df",
              borderLeft: "4px solid #C9A84C",
              borderRadius: "0 12px 12px 0",
              padding: "28px 32px",
            }}>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B6914", margin: "0 0 12px" }}>
                A note from the artisan
              </p>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontStyle: "italic", color: "#3a2e24", margin: 0, lineHeight: 1.6 }}>
                {artisan.letterToBuyer}
              </p>
            </div>
          </div>
        )}

        {/* Social Links */}
        {socialLinks && Object.values(socialLinks).some(Boolean) && (
          <div style={{ maxWidth: 900, margin: "0 auto 64px", padding: "0 20px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#9a876e", marginBottom: 16 }}>
              Follow {artisan.name}
            </p>
            <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12 }}>
              {socialLinks.instagram && (
                <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", border: "1.5px solid #ede8df", borderRadius: 8, textDecoration: "none", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#3a2e24", background: "#fff" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                  Instagram
                </a>
              )}
              {socialLinks.facebook && (
                <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", border: "1.5px solid #ede8df", borderRadius: 8, textDecoration: "none", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#3a2e24", background: "#fff" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook
                </a>
              )}
              {socialLinks.tiktok && (
                <a href={socialLinks.tiktok} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", border: "1.5px solid #ede8df", borderRadius: 8, textDecoration: "none", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#3a2e24", background: "#fff" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
                  TikTok
                </a>
              )}
              {socialLinks.youtube && (
                <a href={socialLinks.youtube} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", border: "1.5px solid #ede8df", borderRadius: 8, textDecoration: "none", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#3a2e24", background: "#fff" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
                  YouTube
                </a>
              )}
              {socialLinks.website && (
                <a href={socialLinks.website} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", border: "1.5px solid #ede8df", borderRadius: 8, textDecoration: "none", fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#3a2e24", background: "#fff" }}>
                  🌐 Website
                </a>
              )}
            </div>
          </div>
        )}

        {/* Back link */}
        <div style={{ maxWidth: 900, margin: "0 auto 48px", padding: "0 20px" }}>
          <Link href="/artisans" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#8B6914", textDecoration: "none" }}>
            ← All Artisans
          </Link>
        </div>

      </div>
    </>
  );
}
